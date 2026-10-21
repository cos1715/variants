-- Per-round settings replace normal/special for all new game logic.  Keep the
-- old type columns so existing snapshots and already-applied migrations remain valid.
alter table public.questions add column if not exists answer_count smallint;
update public.questions set answer_count = case when type = 'special' then 3 else 1 end where answer_count is null;
alter table public.questions alter column answer_count set default 1;
alter table public.questions alter column answer_count set not null;
alter table public.questions drop constraint if exists questions_answer_count_check;
alter table public.questions add constraint questions_answer_count_check check (answer_count between 1 and 5);

alter table public.room_questions add column if not exists answer_count smallint;
update public.room_questions set answer_count = case when type = 'special' then 3 else 1 end where answer_count is null;
alter table public.room_questions alter column answer_count set default 1;
alter table public.room_questions alter column answer_count set not null;
alter table public.room_questions drop constraint if exists room_questions_answer_count_check;
alter table public.room_questions add constraint room_questions_answer_count_check check (answer_count between 1 and 5);

alter table public.room_rounds
  add column if not exists answering_seconds integer,
  add column if not exists voting_seconds integer,
  add column if not exists answer_count smallint;
update public.room_rounds r set answering_seconds = rooms.answering_seconds, voting_seconds = rooms.voting_seconds,
  answer_count = room_questions.answer_count
from public.rooms, public.room_questions
where r.room_id = rooms.id and r.question_id = room_questions.id
  and (r.answering_seconds is null or r.voting_seconds is null or r.answer_count is null);
alter table public.room_rounds alter column answering_seconds set not null;
alter table public.room_rounds alter column voting_seconds set not null;
alter table public.room_rounds alter column answer_count set not null;
alter table public.room_rounds drop constraint if exists room_rounds_answering_seconds_check;
alter table public.room_rounds add constraint room_rounds_answering_seconds_check check (answering_seconds in (30, 60, 90, 120));
alter table public.room_rounds drop constraint if exists room_rounds_voting_seconds_check;
alter table public.room_rounds add constraint room_rounds_voting_seconds_check check (voting_seconds in (15, 30, 45, 60));
alter table public.room_rounds drop constraint if exists room_rounds_answer_count_check;
alter table public.room_rounds add constraint room_rounds_answer_count_check check (answer_count between 1 and 5);

-- Five player answers need indexes 0..4; older special rounds allowed only 0..2.
alter table public.room_answers drop constraint if exists room_answers_answer_index_check;
alter table public.room_answers add constraint room_answers_answer_index_check check (answer_index between 0 and 4);

create or replace function public.start_room_with_snapshot(p_room_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare room_preset_id uuid; room_status text;
begin
  select preset_id, status into room_preset_id, room_status from rooms where id = p_room_id for update;
  if room_preset_id is null then raise exception 'Preset not found'; end if;
  if room_status <> 'lobby' then return 'already_started'; end if;
  if exists (select 1 from room_questions where room_id = p_room_id) then return 'already_started'; end if;
  if not exists (select 1 from questions where preset_id = room_preset_id) then return 'empty'; end if;
  insert into room_questions (room_id, source_question_id, text, correct_answer, type, answer_count, sort_order)
  select p_room_id, id, text, correct_answer, type, answer_count, sort_order from questions where preset_id = room_preset_id order by sort_order;
  update rooms set status = 'preparing' where id = p_room_id;
  return 'started';
end;
$$;

create or replace function public.prepare_next_room_question(p_room_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_record public.room_questions%rowtype;
begin
  select * into room_record from rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if room_record.status not in ('preparing', 'results') then raise exception 'Round cannot be prepared now'; end if;
  select q.* into question_record from room_questions q where q.room_id = p_room_id
    and not exists (select 1 from room_rounds r where r.room_id = p_room_id and r.question_id = q.id)
    order by q.sort_order limit 1;
  if not found then return null; end if;
  insert into room_rounds(room_id, question_id, answering_seconds, voting_seconds, answer_count)
  values (p_room_id, question_record.id, room_record.answering_seconds, room_record.voting_seconds, question_record.answer_count);
  update rooms set status = 'preparing', current_question_id = question_record.id, phase_ends_at = null, voting_closed_at = null where id = p_room_id;
  return jsonb_build_object('text', question_record.text, 'correctAnswer', question_record.correct_answer, 'answerCount', question_record.answer_count);
end;
$$;

create or replace function public.configure_room_round(p_room_id uuid, p_answering_seconds integer, p_voting_seconds integer, p_answer_count integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype;
begin
  if p_answering_seconds not in (30, 60, 90, 120) or p_voting_seconds not in (15, 30, 45, 60) or p_answer_count not between 1 and 5 then raise exception 'Invalid round settings'; end if;
  select * into room_record from rooms where id = p_room_id for update;
  if not found or room_record.status <> 'preparing' or room_record.current_question_id is null then raise exception 'Round cannot be configured now'; end if;
  update room_rounds set answering_seconds = p_answering_seconds, voting_seconds = p_voting_seconds, answer_count = p_answer_count
    where room_id = p_room_id and question_id = room_record.current_question_id;
  update rooms set answering_seconds = p_answering_seconds, voting_seconds = p_voting_seconds where id = p_room_id;
  return true;
end;
$$;

create or replace function public.start_answering_round(p_room_id uuid, p_host_lie text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_record public.room_questions%rowtype; round_record public.room_rounds%rowtype; host_id uuid;
begin
  select * into room_record from rooms where id = p_room_id for update;
  if not found or room_record.status <> 'preparing' or room_record.current_question_id is null then raise exception 'Round is not ready'; end if;
  if char_length(trim(p_host_lie)) not between 1 and 160 then raise exception 'Host answer is required'; end if;
  select * into question_record from room_questions where id = room_record.current_question_id and room_id = p_room_id;
  select * into round_record from room_rounds where room_id = p_room_id and question_id = room_record.current_question_id;
  select id into host_id from participants where room_id = p_room_id and role = 'host' limit 1;
  if host_id is null or not found then raise exception 'Host not found'; end if;
  delete from room_public_answers where room_id = p_room_id and question_id = question_record.id;
  delete from room_answers where room_id = p_room_id and question_id = question_record.id;
  insert into room_answers(room_id, question_id, participant_id, kind, answer_index, text) values
    (p_room_id, question_record.id, null, 'correct', 0, question_record.correct_answer),
    (p_room_id, question_record.id, host_id, 'host_lie', 0, trim(p_host_lie));
  update rooms set status = 'answering', phase_ends_at = now() + make_interval(secs => round_record.answering_seconds), voting_closed_at = null where id = p_room_id;
  return true;
end;
$$;

create or replace function public.submit_room_answers(p_room_id uuid, p_participant_id uuid, p_answers text[])
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; expected_count integer; answer_text text; i integer;
begin
  select * into room_record from rooms where id = p_room_id for update;
  if not found or room_record.status <> 'answering' or room_record.phase_ends_at is null or room_record.phase_ends_at <= now() then raise exception 'Answer deadline has passed'; end if;
  select answer_count into expected_count from room_rounds where room_id = p_room_id and question_id = room_record.current_question_id;
  if coalesce(array_length(p_answers, 1), 0) <> expected_count then raise exception 'Incorrect answer count'; end if;
  if not exists (select 1 from participants where id = p_participant_id and room_id = p_room_id and role = 'player') then raise exception 'Only players can answer'; end if;
  foreach answer_text in array p_answers loop if char_length(trim(answer_text)) not between 1 and 160 then raise exception 'Invalid answer'; end if; end loop;
  delete from room_answers where room_id = p_room_id and question_id = room_record.current_question_id and participant_id = p_participant_id and kind = 'player_lie';
  for i in 1..expected_count loop insert into room_answers(room_id, question_id, participant_id, kind, answer_index, text) values (p_room_id, room_record.current_question_id, p_participant_id, 'player_lie', i - 1, trim(p_answers[i])); end loop;
  return true;
end;
$$;

create or replace function public.close_answering_round(p_room_id uuid, p_force boolean default false)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; round_record public.room_rounds%rowtype;
begin
  select * into room_record from rooms where id = p_room_id for update;
  if not found or room_record.status <> 'answering' then return false; end if;
  if not p_force and (room_record.phase_ends_at is null or room_record.phase_ends_at > now()) then return false; end if;
  select * into round_record from room_rounds where room_id = p_room_id and question_id = room_record.current_question_id;
  delete from room_public_answers where room_id = p_room_id and question_id = room_record.current_question_id;
  insert into room_public_answers(room_id, question_id, source_answer_id, position)
  select p_room_id, room_record.current_question_id, id, row_number() over (order by random()) - 1 from room_answers where room_id = p_room_id and question_id = room_record.current_question_id;
  update rooms set status = 'voting', phase_ends_at = now() + make_interval(secs => round_record.voting_seconds), voting_closed_at = null where id = p_room_id;
  return true;
end;
$$;

create table if not exists public.room_score_adjustments (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict, delta smallint not null check (delta between -20 and 20 and delta <> 0),
  reason varchar(160), created_at timestamptz not null default now()
);
create index if not exists room_score_adjustments_room_created_idx on public.room_score_adjustments(room_id, created_at desc);
alter table public.room_score_adjustments enable row level security;
revoke all on table public.room_score_adjustments from public, anon, authenticated;
grant select, insert on table public.room_score_adjustments to service_role;

create or replace function public.adjust_room_score(p_room_id uuid, p_participant_id uuid, p_delta integer, p_reason text default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_status text; clean_reason text;
begin
  if p_delta not between -20 and 20 or p_delta = 0 then raise exception 'Invalid score adjustment'; end if;
  clean_reason := nullif(trim(coalesce(p_reason, '')), '');
  if clean_reason is not null and char_length(clean_reason) > 160 then raise exception 'Reason is too long'; end if;
  select status into room_status from rooms where id = p_room_id for update;
  if not found or room_status not in ('preparing', 'results') then raise exception 'Score cannot be adjusted now'; end if;
  if not exists (select 1 from participants where id = p_participant_id and room_id = p_room_id and role = 'player' and left_at is null) then raise exception 'Only active players can be adjusted'; end if;
  insert into room_score_adjustments(room_id, participant_id, delta, reason) values (p_room_id, p_participant_id, p_delta, clean_reason);
  update participants set score = score + p_delta where id = p_participant_id and room_id = p_room_id;
  return true;
end;
$$;

create or replace function public.show_room_results(p_room_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype;
begin
  select * into room_record from rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if room_record.status = 'results' then return true; end if;
  if room_record.status <> 'voting' or room_record.current_question_id is null then raise exception 'Results cannot be shown now'; end if;
  if room_record.voting_closed_at is null then if room_record.phase_ends_at is null or room_record.phase_ends_at > now() then raise exception 'Voting is still open'; end if; update rooms set voting_closed_at = now() where id = p_room_id; end if;
  if exists (select 1 from room_rounds where room_id = p_room_id and question_id = room_record.current_question_id and finalized_at is not null) then update rooms set status = 'results', phase_ends_at = null where id = p_room_id; return true; end if;
  insert into room_round_scores(room_id, question_id, participant_id, score_delta)
  select p_room_id, room_record.current_question_id, participant_id, sum(score_delta)::integer from (
    select v.voter_participant_id participant_id, 2 score_delta from room_votes v join room_public_answers pa on pa.id = v.public_answer_id join room_answers a on a.id = pa.source_answer_id where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'correct'
    union all select v.voter_participant_id, -2 from room_votes v join room_public_answers pa on pa.id = v.public_answer_id join room_answers a on a.id = pa.source_answer_id where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'host_lie'
    union all select a.participant_id, 1 from room_votes v join room_public_answers pa on pa.id = v.public_answer_id join room_answers a on a.id = pa.source_answer_id where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'player_lie'
  ) deltas group by participant_id;
  update participants p set score = p.score + s.score_delta from room_round_scores s where s.room_id = p_room_id and s.question_id = room_record.current_question_id and s.participant_id = p.id;
  update room_rounds set finalized_at = now() where room_id = p_room_id and question_id = room_record.current_question_id and finalized_at is null;
  update rooms set status = 'results', phase_ends_at = null where id = p_room_id;
  return true;
end;
$$;

revoke all on function public.configure_room_round(uuid, integer, integer, integer), public.adjust_room_score(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.configure_room_round(uuid, integer, integer, integer), public.adjust_room_score(uuid, uuid, integer, text) to service_role;
