-- Stage 2: public preset data is served only through the Next.js server.
-- The browser has no direct rights to these tables or to active-game answers.

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null check (char_length(trim(name)) between 2 and 80),
  is_builtin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid not null references public.presets(id) on delete cascade,
  text varchar(400) not null check (char_length(trim(text)) between 3 and 400),
  correct_answer varchar(160) not null check (char_length(trim(correct_answer)) between 1 and 160),
  type text not null check (type in ('normal', 'special')),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint questions_preset_sort_order_key unique (preset_id, sort_order)
);

-- A snapshot deliberately keeps the original UUID without a foreign key: source questions
-- may be edited or deleted after a game starts, but the round must remain reproducible.
create table if not exists public.room_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_question_id uuid not null,
  text varchar(400) not null,
  correct_answer varchar(160) not null,
  type text not null check (type in ('normal', 'special')),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint room_questions_room_sort_order_key unique (room_id, sort_order)
);

create index if not exists questions_preset_order_idx on public.questions(preset_id, sort_order);
create index if not exists room_questions_room_order_idx on public.room_questions(room_id, sort_order);

insert into public.presets (id, name, is_builtin)
values ('00000000-0000-4000-8000-000000000001', 'Загальні знання', true)
on conflict (id) do update set name = excluded.name, is_builtin = true;

alter table public.rooms add column if not exists preset_id uuid references public.presets(id) on delete restrict;
update public.rooms set preset_id = '00000000-0000-4000-8000-000000000001' where preset_id is null;
alter table public.rooms alter column preset_id set not null;
create index if not exists rooms_preset_id_idx on public.rooms(preset_id);

insert into public.questions (preset_id, text, correct_answer, type, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'Столицею якої країни є Канберра?', 'Австралія', 'normal', 0),
  ('00000000-0000-4000-8000-000000000001', 'Яка планета розташована найближче до Сонця?', 'Меркурій', 'normal', 1),
  ('00000000-0000-4000-8000-000000000001', 'Який хімічний символ має золото?', 'Au', 'normal', 2),
  ('00000000-0000-4000-8000-000000000001', 'Який океан є найбільшим на Землі?', 'Тихий океан', 'normal', 3),
  ('00000000-0000-4000-8000-000000000001', 'Хто написав драму-феєрію «Лісова пісня»?', 'Леся Українка', 'normal', 4),
  ('00000000-0000-4000-8000-000000000001', 'Яка гора є найвищою у світі над рівнем моря?', 'Еверест', 'normal', 5),
  ('00000000-0000-4000-8000-000000000001', 'Яка мова є офіційною в Бразилії?', 'Португальська', 'normal', 6),
  ('00000000-0000-4000-8000-000000000001', 'Скільки кісток зазвичай має скелет дорослої людини?', '206', 'normal', 7),
  ('00000000-0000-4000-8000-000000000001', 'Яка найбільша планета Сонячної системи?', 'Юпітер', 'normal', 8),
  ('00000000-0000-4000-8000-000000000001', 'Хто намалював «Мону Лізу»?', 'Леонардо да Вінчі', 'normal', 9),
  ('00000000-0000-4000-8000-000000000001', 'Столицею якої країни є Оттава?', 'Канада', 'normal', 10),
  ('00000000-0000-4000-8000-000000000001', 'Як називається найбільший супутник Сатурна?', 'Титан', 'normal', 11),
  ('00000000-0000-4000-8000-000000000001', 'Який газ рослини поглинають під час фотосинтезу?', 'Вуглекислий газ', 'normal', 12),
  ('00000000-0000-4000-8000-000000000001', 'Скільки гравців одночасно виходять на поле від однієї футбольної команди?', '11', 'normal', 13),
  ('00000000-0000-4000-8000-000000000001', 'Яка одиниця вимірює електричний опір?', 'Ом', 'normal', 14),
  ('00000000-0000-4000-8000-000000000001', 'У якому місті розташована Ейфелева вежа?', 'Париж', 'normal', 15),
  ('00000000-0000-4000-8000-000000000001', 'У якому році Україна проголосила незалежність?', '1991', 'special', 16),
  ('00000000-0000-4000-8000-000000000001', 'Яку планету називають Червоною?', 'Марс', 'special', 17),
  ('00000000-0000-4000-8000-000000000001', 'Яка римська цифра означає сто?', 'C', 'special', 18),
  ('00000000-0000-4000-8000-000000000001', 'Скільки струн має класична гітара?', '6', 'special', 19)
on conflict (preset_id, sort_order) do nothing;

alter table public.presets enable row level security;
alter table public.questions enable row level security;
alter table public.room_questions enable row level security;
revoke all on table public.presets, public.questions, public.room_questions from anon, authenticated;
grant select, insert, update, delete on table public.presets, public.questions, public.room_questions to service_role;

create or replace function public.move_preset_question(p_preset_id uuid, p_question_id uuid, p_direction integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_order integer;
  target_id uuid;
  target_order integer;
begin
  if p_direction not in (-1, 1) then raise exception 'Invalid direction'; end if;
  select sort_order into current_order from questions where id = p_question_id and preset_id = p_preset_id for update;
  if current_order is null then return false; end if;
  select id, sort_order into target_id, target_order from questions
  where preset_id = p_preset_id and sort_order = current_order + p_direction for update;
  if target_id is null then return false; end if;
  update questions set sort_order = 1000000 + current_order where id = p_question_id;
  update questions set sort_order = current_order where id = target_id;
  update questions set sort_order = target_order where id = p_question_id;
  return true;
end;
$$;

create or replace function public.delete_preset_question(p_preset_id uuid, p_question_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_order integer;
begin
  select sort_order into current_order from questions where id = p_question_id and preset_id = p_preset_id for update;
  if current_order is null then return false; end if;
  delete from questions where id = p_question_id;
  update questions set sort_order = sort_order + 1000000 where preset_id = p_preset_id and sort_order > current_order;
  update questions set sort_order = sort_order - 1000001 where preset_id = p_preset_id and sort_order >= 1000000;
  return true;
end;
$$;

create or replace function public.start_room_with_snapshot(p_room_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  room_preset_id uuid;
  room_status text;
begin
  select preset_id, status into room_preset_id, room_status from rooms where id = p_room_id for update;
  if room_preset_id is null then raise exception 'Preset not found'; end if;
  if room_status <> 'lobby' then return 'already_started'; end if;
  if exists (select 1 from room_questions where room_id = p_room_id) then return 'already_started'; end if;
  if not exists (select 1 from questions where preset_id = room_preset_id) then return 'empty'; end if;
  insert into room_questions (room_id, source_question_id, text, correct_answer, type, sort_order)
  select p_room_id, id, text, correct_answer, type, sort_order from questions where preset_id = room_preset_id order by sort_order;
  update rooms set status = 'waiting_for_question' where id = p_room_id;
  return 'started';
end;
$$;

revoke all on function public.move_preset_question(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.delete_preset_question(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_room_with_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.move_preset_question(uuid, uuid, integer) to service_role;
grant execute on function public.delete_preset_question(uuid, uuid) to service_role;
grant execute on function public.start_room_with_snapshot(uuid) to service_role;
