-- Keep local migration history aligned with the already-applied production schema.
alter table public.rooms
  add column if not exists preset_key text not null default 'classic'
  check (preset_key = 'classic');

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('lobby', 'waiting_for_question', 'ended'));
