-- ============================================================
-- Phase 38 — the free sample is not the landing page.
--
-- One flag was doing two jobs. `showcase` picked the worked example
-- printed on the landing page, one per format, and /sample then
-- started reading the same rows for a stranger to answer. Making it
-- hold several broke the first job to serve the second: the landing
-- page wants ONE good SBA and ONE good EMQ, chosen for how they read;
-- the sample wants a handful chosen for what they teach.
--
-- So they are two flags now, with two buttons in the Bank:
--
--   showcase     the example on the landing page. One per format,
--                enforced: marking a second stands the first down.
--   free_sample  what /sample offers to someone with no account.
--                As many as you like.
--
-- Run in the Supabase SQL editor. Until it is run, /sample falls back
-- to the showcase rows, which is what it serves today, so nothing
-- empties while this is outstanding.
-- ============================================================

alter table public.generated_questions
  add column if not exists free_sample boolean not null default false;

comment on column public.generated_questions.free_sample is
  'Shown on /sample, the questions a visitor with no account can answer. Set in Admin, Bank. Separate from showcase, which is the landing page example.';

-- The sample page reads this on every visit, and the bank is two
-- thousand rows: a partial index keeps that a lookup rather than a scan.
create index if not exists generated_questions_free_sample_idx
  on public.generated_questions (id)
  where free_sample;

-- Start it where it is today, so running this changes nothing a
-- visitor sees until you choose otherwise: whatever is on the landing
-- page is also the sample, which is the current behaviour.
update public.generated_questions
  set free_sample = true
  where showcase and status = 'approved';
