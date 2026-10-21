-- Room codes are invitation credentials, so they must not be published to anonymous clients.
drop trigger if exists participants_lobby_event on public.participants;
drop trigger if exists rooms_lobby_event on public.rooms;
drop trigger if exists rooms_game_event on public.rooms;

drop policy if exists "public can receive lobby refresh events" on public.room_lobby_events;
drop policy if exists "public can receive game refresh events" on public.room_game_events;
revoke all on table public.room_lobby_events, public.room_game_events from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_lobby_events') then
    alter publication supabase_realtime drop table public.room_lobby_events;
  end if;
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_game_events') then
    alter publication supabase_realtime drop table public.room_game_events;
  end if;
end $$;
