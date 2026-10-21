-- Stage 1: private room/member records and a minimal public Realtime event feed.
-- Apply this in the Supabase SQL editor or with `supabase db push`.

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code char(6) not null unique check (code ~ '^[0-9]{6}$'),
  host_token_hash text not null,
  status text not null default 'lobby' check (status in ('lobby', 'waiting_for_question')),
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name varchar(24) not null check (char_length(trim(name)) between 2 and 24),
  role text not null check (role in ('host', 'player', 'spectator')),
  session_token_hash text not null,
  joined_at timestamptz not null default now()
);

create index if not exists participants_room_id_idx on public.participants(room_id);
create index if not exists participants_session_lookup_idx on public.participants(room_id, session_token_hash);

-- This contains no session/host tokens and is the only table a browser may read.
create table if not exists public.room_lobby_events (
  id bigint generated always as identity primary key,
  room_code char(6) not null check (room_code ~ '^[0-9]{6}$'),
  event_type text not null check (event_type in ('participants_changed', 'room_changed')),
  created_at timestamptz not null default now()
);
create index if not exists room_lobby_events_code_idx on public.room_lobby_events(room_code, id desc);

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.room_lobby_events enable row level security;

-- No client policies exist for the private records. Only the server service role uses them.
revoke all on table public.rooms from anon, authenticated;
revoke all on table public.participants from anon, authenticated;
grant select, insert, update, delete on table public.rooms to service_role;
grant select, insert, update, delete on table public.participants to service_role;

-- A room code is the invite secret. The event itself reveals only that a lobby changed.
create policy "public can receive lobby refresh events"
on public.room_lobby_events for select to anon, authenticated using (true);
revoke all on table public.room_lobby_events from anon, authenticated;
grant select on table public.room_lobby_events to anon, authenticated;
grant select, insert, update, delete on table public.room_lobby_events to service_role;

create or replace function public.emit_room_lobby_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
  target_code char(6);
  event_kind text;
begin
  if tg_table_name = 'participants' then
    target_room_id := coalesce(new.room_id, old.room_id);
  else
    target_room_id := coalesce(new.id, old.id);
  end if;
  select code into target_code from public.rooms where id = target_room_id;
  if target_code is null then return coalesce(new, old); end if;
  event_kind := case when tg_table_name = 'participants' then 'participants_changed' else 'room_changed' end;
  insert into public.room_lobby_events(room_code, event_type) values (target_code, event_kind);
  return coalesce(new, old);
end;
$$;

revoke all on function public.emit_room_lobby_event() from public, anon, authenticated;
grant execute on function public.emit_room_lobby_event() to service_role;

drop trigger if exists participants_lobby_event on public.participants;
create trigger participants_lobby_event
after insert or update or delete on public.participants
for each row execute function public.emit_room_lobby_event();

drop trigger if exists rooms_lobby_event on public.rooms;
create trigger rooms_lobby_event
after update of status on public.rooms
for each row execute function public.emit_room_lobby_event();

-- Postgres Changes requires the event table in this publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_lobby_events'
  ) then
    alter publication supabase_realtime add table public.room_lobby_events;
  end if;
end $$;
