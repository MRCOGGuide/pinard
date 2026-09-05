-- ============================================================
-- PINARD — Phase 28: the table under an explanation
-- Paste into the Supabase SQL editor and Run (once).
--
-- Some guidance is a table, and prose is the wrong shape for it. The
-- risks of surgical abortion are three figures that only mean anything
-- against each other — cervical injury 1 in 100, perforation 1-4 in
-- 1000, rupture under 1 in 1000 — and a candidate who meets them as a
-- sentence has to hold them in their head to compare them. Bile acids
-- in ICP are the same: four bands, each with its own stillbirth risk
-- and its own timing.
--
-- So a question may carry one, structured rather than written into the
-- prose: columns and rows, with the row this question turns on marked
-- so the answer is seen in its context.
--
-- Shape:
--   {
--     "caption": "Risks of surgical abortion",
--     "columns": ["Complication", "Risk"],
--     "rows": [["Cervical injury", "1 in 100"], ...],
--     "highlight": 1
--   }
-- ============================================================

alter table public.generated_questions
  add column if not exists explanation_table jsonb;

comment on column public.generated_questions.explanation_table is
  'Optional table shown under the explanation, for guidance that stratifies: {caption, columns[], rows[][], highlight?}. The highlighted row is the one the question turns on.';
