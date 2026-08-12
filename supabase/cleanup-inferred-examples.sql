-- ============================================================
-- PINARD — remove AI-guessed example answers
-- Run ONCE, after deploying the "answers must be sourced" change.
-- ============================================================

-- Earlier imports allowed the model to guess an answer when the
-- document didn't state one, tagging the rationale
-- "[AI-inferred answer — verify]". Those answers are unreliable and
-- must not sit in the style library. Guessing is now impossible — an
-- answer is only accepted when it is quoted from the document and that
-- quote is found in the text — so these rows are simply deleted.

-- 1. See what will go (run this first).
select count(*) as inferred_examples
from public.example_questions
where rationale like '[AI-inferred answer%';

-- 2. EMQ sets are stored one row per scenario; drop whole sets where
--    any scenario was guessed, so no set is left half-answered.
delete from public.example_questions
where emq_group_id in (
  select distinct emq_group_id
  from public.example_questions
  where emq_group_id is not null
    and rationale like '[AI-inferred answer%'
);

-- 3. Drop the remaining guessed SBAs.
delete from public.example_questions
where rationale like '[AI-inferred answer%';
