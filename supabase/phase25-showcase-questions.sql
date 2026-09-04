-- ============================================================
-- PINARD — Phase 25: questions shown on the landing page
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- The two specimens on the public page were written into the code, so
-- changing them meant a deploy. They are chosen in the Bank now: mark a
-- question as the showcase for its format and the landing page picks it
-- up. Marking a new one stands the old one down, so exactly one SBA and
-- one EMQ set are ever on show.
alter table public.generated_questions
  add column if not exists showcase boolean not null default false;

create index if not exists generated_questions_showcase_idx
  on public.generated_questions (format, showcase)
  where showcase;

comment on column public.generated_questions.showcase is
  'Shown as the worked example on the public landing page. One per format.';
