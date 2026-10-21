-- A vote for the host's lie costs the voter two points.
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
    select v.voter_participant_id, -2
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

revoke all on function public.show_room_results(uuid) from public, anon, authenticated;
grant execute on function public.show_room_results(uuid) to service_role;
