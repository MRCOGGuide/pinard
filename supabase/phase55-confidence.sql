-- ============================================================
-- PINARD — Phase 55: what a candidate tells Pinard about themselves
-- Paste into the Supabase SQL editor and Run (once). Safe to run again.
-- ============================================================
--
-- Why (owner, 16 November 2026): a new candidate is asked their exam date,
-- how much time they have each week, and how confident they feel in each
-- topic. Until their answers say otherwise, the study plan follows what
-- they said: topics they are not confident in get most of the time, topics
-- they are confident in are checked early to confirm it. Answers then take
-- over, and a confidence the answers do not bear out is overridden.
--
-- What it adds, and nothing else:
--   1. section_confidence: one row per candidate and topic they have rated.
--      A topic left unrated has no row. Each candidate reads and writes
--      only their own rows.
--   2. profiles.study_hours_per_week: the hours a week they said they have,
--      which sets how many questions a day the plan asks of them. Empty
--      until they answer, and the plan keeps today's 10 a day meanwhile.

create table if not exists public.section_confidence (
  user_id uuid not null references public.profiles (id) on delete cascade,
  section_id bigint not null references public.sections (id) on delete cascade,
  confidence text not null check (confidence in ('confident', 'unsure', 'not_confident')),
  updated_at timestamptz not null default now(),
  primary key (user_id, section_id)
);

alter table public.section_confidence enable row level security;

-- ---------- section_confidence (own rows) ----------
drop policy if exists "section_confidence: read own" on public.section_confidence;
create policy "section_confidence: read own"
  on public.section_confidence for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "section_confidence: insert own" on public.section_confidence;
create policy "section_confidence: insert own"
  on public.section_confidence for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "section_confidence: update own" on public.section_confidence;
create policy "section_confidence: update own"
  on public.section_confidence for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "section_confidence: delete own" on public.section_confidence;
create policy "section_confidence: delete own"
  on public.section_confidence for delete to authenticated
  using (user_id = auth.uid());

-- ---------- profiles.study_hours_per_week ----------
alter table public.profiles
  add column if not exists study_hours_per_week smallint
  check (study_hours_per_week is null or study_hours_per_week between 1 and 80);
