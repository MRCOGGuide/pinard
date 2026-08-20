-- ============================================================
-- PINARD — Phase 16: the explanation shown on the card
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Questions carry two kinds of explanation. `explanations` (jsonb) is
-- the per-option working: one entry per option, each with its own
-- citations, which is what the admin reviews and what grounds the
-- question. `explanation` is the single paragraph the candidate reads
-- under the card — the correct answer's reasoning, then the other
-- options dismissed briefly. Nullable, because every question written
-- before this phase has only the per-option working; the card falls
-- back to composing from that when the column is null.
alter table public.generated_questions
  add column if not exists explanation text;
