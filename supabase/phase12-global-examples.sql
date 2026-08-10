-- ============================================================
-- PINARD — Phase 12: global (all-section) example questions
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- A revision book of exam questions spans the whole syllabus, so its
-- exemplars shouldn't be filed under one section. A null section_id
-- means "applies to every section": generation uses the section's own
-- examples first and tops up from the global pool.
alter table public.example_questions
  alter column section_id drop not null;
