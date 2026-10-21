-- Stage 3: all state transitions are performed inside the database so a browser
-- cannot open answers early or advance a round by changing client state.
alter table public.rooms drop constraint if exists rooms_status_check;
update public.rooms set status = 'preparing' where status = 'waiting_for_question';
update public.rooms set status = 'finished' where status = 'ended';
alter table public.rooms
  add column if not exists current_question_id uuid references public.room_questions(id) on delete restrict,
  add column if not exists answering_seconds integer not null default 60 check (answering_seconds in (30, 60, 90, 120)),
  add column if not exists voting_seconds integer not null default 30 check (voting_seconds in (15, 30, 45, 60)),
  add column if not exists phase_ends_at timestamptz;
alter table public.rooms add constraint rooms_status_check check (status in ('lobby', 'preparing', 'answering', 'voting', 'results', 'finished'));

create or replace function public.start_room_with_snapshot(p_room_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare room_preset_id uuid; room_status text;
begin
  select preset_id, status into room_preset_id, room_status from public.rooms where id = p_room_id for update;
  if room_preset_id is null then raise exception 'Preset not found'; end if;
  if room_status <> 'lobby' then return 'already_started'; end if;
  if exists (select 1 from public.room_questions where room_id = p_room_id) then return 'already_started'; end if;
  if not exists (select 1 from public.questions where preset_id = room_preset_id) then return 'empty'; end if;
  insert into public.room_questions (room_id, source_question_id, text, correct_answer, type, sort_order)
  select p_room_id, id, text, correct_answer, type, sort_order from public.questions where preset_id = room_preset_id order by sort_order;
  update public.rooms set status = 'preparing', phase_ends_at = null where id = p_room_id;
  return 'started';
end;
$$;
revoke all on function public.start_room_with_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.start_room_with_snapshot(uuid) to service_role;

create table if not exists public.room_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.room_questions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (room_id, question_id)
);

create table if not exists public.room_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.room_questions(id) on delete restrict,
  participant_id uuid references public.participants(id) on delete cascade,
  kind text not null check (kind in ('correct', 'host_lie', 'player_lie')),
  answer_index smallint not null check (answer_index between 0 and 2),
  text varchar(160) not null check (char_length(trim(text)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'correct' and participant_id is null) or (kind <> 'correct' and participant_id is not null))
);
create unique index if not exists room_answers_player_slot_idx on public.room_answers(room_id, question_id, participant_id, answer_index) where participant_id is not null;
create unique index if not exists room_answers_correct_idx on public.room_answers(room_id, question_id) where kind = 'correct';
create unique index if not exists room_answers_host_lie_idx on public.room_answers(room_id, question_id) where kind = 'host_lie';
create index if not exists room_answers_room_question_idx on public.room_answers(room_id, question_id);

create table if not exists public.room_public_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  question_id uuid not null references public.room_questions(id) on delete restrict,
  source_answer_id uuid not null references public.room_answers(id) on delete cascade,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (room_id, question_id, source_answer_id),
  unique (room_id, question_id, position)
);
create index if not exists room_public_answers_room_question_idx on public.room_public_answers(room_id, question_id, position);

create table if not exists public.room_game_events (
  id bigint generated always as identity primary key,
  room_code char(6) not null check (room_code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now()
);
create index if not exists room_game_events_code_idx on public.room_game_events(room_code, id desc);

alter table public.room_rounds enable row level security;
alter table public.room_answers enable row level security;
alter table public.room_public_answers enable row level security;
alter table public.room_game_events enable row level security;
revoke all on table public.room_rounds, public.room_answers, public.room_public_answers, public.room_game_events from anon, authenticated;
grant select, insert, update, delete on table public.room_rounds, public.room_answers, public.room_public_answers, public.room_game_events to service_role;
create policy "public can receive game refresh events" on public.room_game_events for select to anon, authenticated using (true);
grant select on table public.room_game_events to anon, authenticated;

create or replace function public.emit_room_game_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_code char(6);
begin
  select code into target_code from public.rooms where id = new.id;
  if target_code is not null then insert into public.room_game_events(room_code) values (target_code); end if;
  return new;
end;
$$;
revoke all on function public.emit_room_game_event() from public, anon, authenticated;
grant execute on function public.emit_room_game_event() to service_role;
drop trigger if exists rooms_game_event on public.rooms;
create trigger rooms_game_event after update of status, current_question_id, phase_ends_at, answering_seconds, voting_seconds on public.rooms
for each row execute function public.emit_room_game_event();

create or replace function public.prepare_next_room_question(p_room_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_record public.room_questions%rowtype;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if room_record.status not in ('preparing', 'voting') then raise exception 'Round cannot be prepared now'; end if;
  select q.* into question_record from public.room_questions q
    where q.room_id = p_room_id and not exists (select 1 from public.room_rounds r where r.room_id = p_room_id and r.question_id = q.id)
    order by q.sort_order asc limit 1;
  if not found then return null; end if;
  insert into public.room_rounds(room_id, question_id) values (p_room_id, question_record.id);
  update public.rooms set status = 'preparing', current_question_id = question_record.id, phase_ends_at = null where id = p_room_id;
  return jsonb_build_object('text', question_record.text, 'correctAnswer', question_record.correct_answer, 'type', question_record.type);
end;
$$;

create or replace function public.configure_room_timers(p_room_id uuid, p_answering_seconds integer, p_voting_seconds integer)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  if p_answering_seconds not in (30, 60, 90, 120) or p_voting_seconds not in (15, 30, 45, 60) then raise exception 'Invalid timers'; end if;
  update public.rooms set answering_seconds = p_answering_seconds, voting_seconds = p_voting_seconds
    where id = p_room_id and status = 'preparing';
  if not found then raise exception 'Timers cannot be changed now'; end if;
  return true;
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
  update public.rooms set status = 'answering', phase_ends_at = now() + make_interval(secs => answering_seconds) where id = p_room_id;
  return true;
end;
$$;

create or replace function public.submit_room_answers(p_room_id uuid, p_participant_id uuid, p_answers text[])
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_record public.rooms%rowtype; question_type text; expected_count integer; answer_text text; i integer;
begin
  select * into room_record from public.rooms where id = p_room_id for update;
  if not found or room_record.status <> 'answering' or room_record.phase_ends_at is null or room_record.phase_ends_at <= now() then raise exception 'Answer deadline has passed'; end if;
  select type into question_type from public.room_questions where id = room_record.current_question_id and room_id = p_room_id;
  expected_count := case when question_type = 'special' then 3 else 1 end;
  if coalesce(array_length(p_answers, 1), 0) <> expected_count then raise exception 'Incorrect answer count'; end if;
  if not exists (select 1 from public.participants where id = p_participant_id and room_id = p_room_id and role = 'player') then raise exception 'Only players can answer'; end if;
  foreach answer_text in array p_answers loop
    if char_length(trim(answer_text)) not between 1 and 160 then raise exception 'Invalid answer'; end if;
  end loop;
  delete from public.room_answers where room_id = p_room_id and question_id = room_record.current_question_id and participant_id = p_participant_id and kind = 'player_lie';
  for i in 1..expected_count loop
    insert into public.room_answers(room_id, question_id, participant_id, kind, answer_index, text)
    values (p_room_id, room_record.current_question_id, p_participant_id, 'player_lie', i - 1, trim(p_answers[i]));
  end loop;
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
  update public.rooms set status = 'voting', phase_ends_at = now() + make_interval(secs => voting_seconds) where id = p_room_id;
  return true;
end;
$$;

create or replace function public.close_expired_answering_rounds()
returns integer language plpgsql security invoker set search_path = public as $$
declare room_id uuid; closed_count integer := 0;
begin
  for room_id in select id from public.rooms where status = 'answering' and phase_ends_at <= now() loop
    if public.close_answering_round(room_id, false) then closed_count := closed_count + 1; end if;
  end loop;
  return closed_count;
end;
$$;

revoke all on function public.prepare_next_room_question(uuid), public.configure_room_timers(uuid, integer, integer), public.start_answering_round(uuid, text), public.submit_room_answers(uuid, uuid, text[]), public.close_answering_round(uuid, boolean), public.close_expired_answering_rounds() from public, anon, authenticated;
grant execute on function public.prepare_next_room_question(uuid), public.configure_room_timers(uuid, integer, integer), public.start_answering_round(uuid, text), public.submit_room_answers(uuid, uuid, text[]), public.close_answering_round(uuid, boolean), public.close_expired_answering_rounds() to service_role;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_game_events') then
    alter publication supabase_realtime add table public.room_game_events;
  end if;
end $$;

-- Supabase Cron executes independently of connected browsers. The one-second
-- schedule needs a project on PostgreSQL 15.1.1.61 or newer.
create extension if not exists pg_cron;
select cron.schedule('variants-close-expired-answering-rounds', '1 second', 'select public.close_expired_answering_rounds()');
