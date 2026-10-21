-- Stage 4: votes and score finalization stay entirely in PostgreSQL.  The
-- browser never receives an answer author or correctness before RESULTS.
alter table public.rooms
  add column if not exists voting_closed_at timestamptz;
alter table public.participants
  add column if not exists score integer not null default 0;
alter table public.room_rounds
  add column if not exists finalized_at timestamptz;

create table if not exists public.room_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.room_questions(id) on delete restrict,
  voter_participant_id uuid not null references public.participants(id) on delete cascade,
  public_answer_id uuid not null references public.room_public_answers(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (room_id, question_id, voter_participant_id)
);
create index if not exists room_votes_room_question_idx on public.room_votes(room_id, question_id);

create table if not exists public.room_round_scores (
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.room_questions(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete cascade,
  score_delta integer not null,
  primary key (room_id, question_id, participant_id)
);

alter table public.room_votes enable row level security;
alter table public.room_round_scores enable row level security;
revoke all on table public.room_votes, public.room_round_scores from anon, authenticated;
grant select, insert, update, delete on table public.room_votes, public.room_round_scores to service_role;

create or replace function public.submit_room_vote(p_room_id uuid, p_participant_id uuid, p_public_answer_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; source_author uuid;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found or room_record.status <> 'voting' or room_record.current_question_id is null
    or room_record.voting_closed_at is not null or room_record.phase_ends_at is null or room_record.phase_ends_at <= now() then
    raise exception 'Voting is closed';
  end if;
  if not exists (select 1 from public.participants where id = p_participant_id and room_id = p_room_id and role = 'player') then
    raise exception 'Only players can vote';
  end if;
  select a.participant_id into source_author
  from public.room_public_answers pa join public.room_answers a on a.id = pa.source_answer_id
  where pa.id = p_public_answer_id and pa.room_id = p_room_id and pa.question_id = room_record.current_question_id;
  if not found then raise exception 'Answer does not belong to this round'; end if;
  if source_author = p_participant_id then raise exception 'Cannot vote for own answer'; end if;
  insert into public.room_votes(room_id, question_id, voter_participant_id, public_answer_id)
  values (p_room_id, room_record.current_question_id, p_participant_id, p_public_answer_id);
  return true;
end;
$$;

create or replace function public.close_voting_round(p_room_id uuid, p_force boolean default false)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found or room_record.status <> 'voting' or room_record.voting_closed_at is not null then return false; end if;
  if not p_force and (room_record.phase_ends_at is null or room_record.phase_ends_at > now()) then return false; end if;
  update public.rooms set voting_closed_at = now() where id = p_room_id;
  return true;
end;
$$;

create or replace function public.close_expired_voting_rounds()
returns integer language plpgsql security invoker set search_path = public as $$
declare target_id uuid; closed_count integer := 0;
begin
  for target_id in select id from public.rooms where status = 'voting' and voting_closed_at is null and phase_ends_at <= now() loop
    if public.close_voting_round(target_id, false) then closed_count := closed_count + 1; end if;
  end loop;
  return closed_count;
end;
$$;

create or replace function public.show_room_results(p_room_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if room_record.status = 'results' then return true; end if;
  if room_record.status <> 'voting' or room_record.current_question_id is null then raise exception 'Results cannot be shown now'; end if;
  if room_record.voting_closed_at is null then
    if room_record.phase_ends_at is null or room_record.phase_ends_at > now() then raise exception 'Voting is still open'; end if;
    update public.rooms set voting_closed_at = now() where id = p_room_id;
  end if;
  if exists (select 1 from public.room_rounds where room_id = p_room_id and question_id = room_record.current_question_id and finalized_at is not null) then
    update public.rooms set status = 'results', phase_ends_at = null where id = p_room_id;
    return true;
  end if;
  insert into public.room_round_scores(room_id, question_id, participant_id, score_delta)
  select p_room_id, room_record.current_question_id, participant_id, sum(score_delta)::integer
  from (
    select v.voter_participant_id as participant_id, 2 as score_delta
    from public.room_votes v join public.room_public_answers pa on pa.id = v.public_answer_id
      join public.room_answers a on a.id = pa.source_answer_id
    where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'correct'
    union all
    select v.voter_participant_id, -1
    from public.room_votes v join public.room_public_answers pa on pa.id = v.public_answer_id
      join public.room_answers a on a.id = pa.source_answer_id
    where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'host_lie'
    union all
    select a.participant_id, 1
    from public.room_votes v join public.room_public_answers pa on pa.id = v.public_answer_id
      join public.room_answers a on a.id = pa.source_answer_id
    where v.room_id = p_room_id and v.question_id = room_record.current_question_id and a.kind = 'player_lie'
  ) deltas group by participant_id;
  update public.participants p set score = p.score + s.score_delta
  from public.room_round_scores s
  where s.room_id = p_room_id and s.question_id = room_record.current_question_id and s.participant_id = p.id;
  update public.room_rounds set finalized_at = now() where room_id = p_room_id and question_id = room_record.current_question_id and finalized_at is null;
  update public.rooms set status = 'results', phase_ends_at = null where id = p_room_id;
  return true;
end;
$$;

create or replace function public.prepare_next_room_question(p_room_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_record public.room_questions%rowtype;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if room_record.status not in ('preparing', 'results') then raise exception 'Round cannot be prepared now'; end if;
  select q.* into question_record from public.room_questions q
    where q.room_id = p_room_id and not exists (select 1 from public.room_rounds r where r.room_id = p_room_id and r.question_id = q.id)
    order by q.sort_order asc limit 1;
  if not found then return null; end if;
  insert into public.room_rounds(room_id, question_id) values (p_room_id, question_record.id);
  update public.rooms set status = 'preparing', current_question_id = question_record.id, phase_ends_at = null, voting_closed_at = null where id = p_room_id;
  return jsonb_build_object('text', question_record.text, 'correctAnswer', question_record.correct_answer, 'type', question_record.type);
end;
$$;

create or replace function public.start_answering_round(p_room_id uuid, p_host_lie text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_record public.room_questions%rowtype; host_id uuid;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found or room_record.status <> 'preparing' or room_record.current_question_id is null then raise exception 'Round is not ready'; end if;
  if char_length(trim(p_host_lie)) not between 1 and 160 then raise exception 'Host answer is required'; end if;
  select * into question_record from public.room_questions where id = room_record.current_question_id and room_id = p_room_id;
  select id into host_id from public.participants where room_id = p_room_id and role = 'host' limit 1;
  if host_id is null or not found then raise exception 'Host not found'; end if;
  delete from public.room_public_answers where room_id = p_room_id and question_id = question_record.id;
  delete from public.room_answers where room_id = p_room_id and question_id = question_record.id;
  insert into public.room_answers(room_id, question_id, participant_id, kind, answer_index, text) values
    (p_room_id, question_record.id, null, 'correct', 0, question_record.correct_answer),
    (p_room_id, question_record.id, host_id, 'host_lie', 0, trim(p_host_lie));
  update public.rooms set status = 'answering', phase_ends_at = now() + make_interval(secs => answering_seconds), voting_closed_at = null where id = p_room_id;
  return true;
end;
$$;

create or replace function public.close_answering_round(p_room_id uuid, p_force boolean default false)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found or room_record.status <> 'answering' then return false; end if;
  if not p_force and (room_record.phase_ends_at is null or room_record.phase_ends_at > now()) then return false; end if;
  delete from public.room_public_answers where room_id = p_room_id and question_id = room_record.current_question_id;
  insert into public.room_public_answers(room_id, question_id, source_answer_id, position)
  select p_room_id, room_record.current_question_id, id, row_number() over (order by random()) - 1
  from public.room_answers where room_id = p_room_id and question_id = room_record.current_question_id;
  update public.rooms set status = 'voting', phase_ends_at = now() + make_interval(secs => voting_seconds), voting_closed_at = null where id = p_room_id;
  return true;
end;
$$;

drop trigger if exists rooms_game_event on public.rooms;
create trigger rooms_game_event after update of status, current_question_id, phase_ends_at, answering_seconds, voting_seconds, voting_closed_at on public.rooms
for each row execute function public.emit_room_game_event();

revoke all on function public.submit_room_vote(uuid, uuid, uuid), public.close_voting_round(uuid, boolean), public.close_expired_voting_rounds(), public.show_room_results(uuid) from public, anon, authenticated;
grant execute on function public.submit_room_vote(uuid, uuid, uuid), public.close_voting_round(uuid, boolean), public.close_expired_voting_rounds(), public.show_room_results(uuid) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'variants-close-expired-voting-rounds';
select cron.schedule('variants-close-expired-voting-rounds', '1 second', 'select public.close_expired_voting_rounds()');
