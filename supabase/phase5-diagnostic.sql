-- ============================================================
-- PINARD — Phase 5a: exam-part visibility + diagnostic tracking
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Which exam parts are live for candidates. Admins always see all
-- parts; candidates can only onboard onto live ones. Pilot: Part 2.
create table if not exists public.exam_availability (
  exam public.exam_part primary key,
  is_live boolean not null default false
);

insert into public.exam_availability (exam, is_live) values
  ('part1', false),
  ('part2', true),
  ('part3', false)
on conflict (exam) do nothing;

alter table public.exam_availability enable row level security;

create policy "exam_availability: read"
  on public.exam_availability for select to authenticated
  using (true);

create policy "exam_availability: admin write"
  on public.exam_availability for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- When the user completed their initial diagnostic (null = not yet).
alter table public.profiles
  add column if not exists diagnostic_completed_at timestamptz;
