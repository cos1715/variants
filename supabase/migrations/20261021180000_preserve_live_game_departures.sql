-- Stage 5: an explicit leave must revoke the session without cascading away
-- answers, votes, or scores that were already recorded in a running game.
alter table public.participants add column if not exists left_at timestamptz;

create or replace function public.leave_room_participant(p_room_id uuid, p_participant_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare room_status text;
begin
  select status into room_status from public.rooms where id = p_room_id for update;
  if not found then return false; end if;

  if room_status = 'lobby' then
    delete from public.participants
    where id = p_participant_id and room_id = p_room_id and role <> 'host' and left_at is null;
  else
    update public.participants set left_at = now()
    where id = p_participant_id and room_id = p_room_id and role <> 'host' and left_at is null;
  end if;
  return found;
end;
$$;

revoke all on function public.leave_room_participant(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_room_participant(uuid, uuid) to service_role;
