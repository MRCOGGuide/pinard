-- ============================================================
-- Phase 40 — remember how each mock went.
--
-- Run this whole file in the Supabase SQL editor. It creates one
-- table and its policies, and changes nothing that exists.
--
-- Why a table rather than reading it back off user_answers: a mock's
-- answers go into user_answers like any others, and session_id is a
-- bare uuid with no kind beside it, so nothing in the database tells
-- a mock sitting from a Tuesday's practice. Everything a candidate
-- wants to see about a past paper — the score, the split between the
-- two formats, how each topic went — is therefore unrecoverable
-- after the page is closed. It is cheap to record and impossible to
-- reconstruct, which is the case for writing it down.
--
-- A row per sitting, not per answer. The answers are already in
-- user_answers and still count towards the topic map exactly as
-- practice answers do; this is the paper's own result, which is a
-- different thing and marked on a different scale (40% of the mark on
-- the SBAs, 60% on the EMQs, regardless of how many of each there
-- were).
--
-- `sections` holds the per-topic breakdown as it was computed at the
-- time: [{section_id, title, correct, total, percent}, ...]. Stored
-- rather than recomputed because it is a record of that paper, and a
-- topic renamed or retired later should not change what the candidate
-- was told in March.
-- ============================================================

create table if not exists public.mock_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  sat_at timestamptz not null default now(),
  seconds_taken int,
  sba_correct int not null,
  sba_total int not null,
  -- Scenarios, not sets: every scenario is answered and marked on its
  -- own, so this is what the 60% divides across. The paper is counted
  -- in sets; it is marked in scenarios.
  emq_correct int not null,
  emq_total int not null,
  /* Weighted, 0-100, one decimal. Not derivable from the counts above
     without also knowing the weighting in force at the time. */
  percent numeric not null,
  passed boolean not null,
  sections jsonb not null default '[]'::jsonb
);

-- Newest first for one candidate, which is the only way this is read.
create index if not exists mock_attempts_user_sat_idx
  on public.mock_attempts (user_id, sat_at desc);

alter table public.mock_attempts enable row level security;

-- ---------- mock_attempts (own rows; admin reads for dashboard) ----------
create policy "mock_attempts: read own (admin reads all)"
  on public.mock_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "mock_attempts: insert own"
  on public.mock_attempts for insert to authenticated
  with check (user_id = auth.uid());

/* Delete is what Reset uses, and it is the one table where a
   candidate clearing their own history is the intended behaviour
   rather than something to be guarded against: a mock is a rehearsal,
   and a rehearsal you want to forget is yours to forget. Own rows
   only, which is the whole of the rule. */
create policy "mock_attempts: delete own"
  on public.mock_attempts for delete to authenticated
  using (user_id = auth.uid());

-- Then, from the repository:  npm run preflight
