-- ============================================================
-- PINARD — Phase 27: store the coverage note
-- Paste into the Supabase SQL editor and Run (once).
--
-- Every generated question already returns a coverage_note: one line
-- saying which passage facts it tests. It was parsed and then thrown
-- away, because there was nowhere to put it.
--
-- It is worth keeping. When a section is generated again, the model is
-- shown what has already been asked so it does not re-test the same
-- point — and it was being shown the full stems. A stem is a clinical
-- vignette of some 400 characters, most of which is the woman rather
-- than the knowledge, so the list had to be capped at the most recent
-- 30 to stay affordable. Past 30 questions in a section, the oldest
-- fell out of view and could be asked again.
--
-- The note says the same thing in a fraction of the words, so the whole
-- history fits.
-- ============================================================

alter table public.generated_questions
  add column if not exists coverage_note text;

comment on column public.generated_questions.coverage_note is
  'One line stating which passage facts this question tests. Shown to the generator as the already-asked list, so a later batch tests something else.';
