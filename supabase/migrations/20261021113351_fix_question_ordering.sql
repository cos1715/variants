-- Correct the first ordering routines for the non-negative sort_order constraint.
create or replace function public.move_preset_question(p_preset_id uuid, p_question_id uuid, p_direction integer)
returns boolean language plpgsql security invoker set search_path = public as $$
declare current_order integer; target_id uuid; target_order integer;
begin
  if p_direction not in (-1, 1) then raise exception 'Invalid direction'; end if;
  select sort_order into current_order from questions where id = p_question_id and preset_id = p_preset_id for update;
  if current_order is null then return false; end if;
  select id, sort_order into target_id, target_order from questions where preset_id = p_preset_id and sort_order = current_order + p_direction for update;
  if target_id is null then return false; end if;
  update questions set sort_order = 1000000 + current_order where id = p_question_id;
  update questions set sort_order = current_order where id = target_id;
  update questions set sort_order = target_order where id = p_question_id;
  return true;
end;
$$;

create or replace function public.delete_preset_question(p_preset_id uuid, p_question_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare current_order integer;
begin
  select sort_order into current_order from questions where id = p_question_id and preset_id = p_preset_id for update;
  if current_order is null then return false; end if;
  delete from questions where id = p_question_id;
  update questions set sort_order = sort_order + 1000000 where preset_id = p_preset_id and sort_order > current_order;
  update questions set sort_order = sort_order - 1000001 where preset_id = p_preset_id and sort_order >= 1000000;
  return true;
end;
$$;

revoke all on function public.move_preset_question(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_preset_question(uuid, uuid) from public, anon, authenticated;
grant execute on function public.move_preset_question(uuid, uuid, integer) to service_role;
grant execute on function public.delete_preset_question(uuid, uuid) to service_role;
