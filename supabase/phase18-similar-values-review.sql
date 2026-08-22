-- ============================================================
-- PINARD — Phase 18: owner review of Similar Values facts
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- key_facts holds every figure the extractor could find, which is right
-- for a store and wrong for what sits under an answer. Heuristics get
-- most of the way — fact type, a clean figure, prose that is about
-- practice rather than about a study — but the last call is judgement:
-- a trial-arm complication rate and a genuine mortality figure can both
-- be 1%, and no rule separates them.
--
-- Facts are usable until the owner declines them, so the panel keeps
-- working while the bank is worked through. Declining is the act that
-- is recorded; similar_reviewed_at marks a value group as looked at, so
-- progress through the groups is visible.

alter table public.key_facts
  add column if not exists similar_excluded boolean not null default false,
  add column if not exists similar_reviewed_at timestamptz;

-- The admin screen works value group by value group, and the candidate
-- panel filters excluded facts out of a value lookup.
create index if not exists key_facts_similar_value_idx
  on public.key_facts (value_text)
  where similar_excluded = false;

comment on column public.key_facts.similar_excluded is
  'Owner declined this fact for the Similar Values panel. It stays in the store and can still ground a question.';
comment on column public.key_facts.similar_reviewed_at is
  'When the owner last reviewed the value group this fact belongs to.';
