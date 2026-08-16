-- ============================================================
-- PINARD — Phase 15: reclassify SBA-style "EMQs"
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Prompt Q asked for "an option list of 8–10, a lead-in, and one item",
-- which produces an SBA with extra options rather than an EMQ. Real
-- EMQ sets are now generated as a shared option list + lead-in +
-- several scenarios, stored as one row per scenario sharing
-- emq_group_id. Anything previously stored as an EMQ without a group
-- id is a single-scenario question — i.e. an SBA.

-- 1. See what will be reclassified.
select
  count(*) filter (where format = 'emq' and emq_group_id is null) as sba_style_emqs,
  count(*) filter (where format = 'emq' and emq_group_id is not null) as real_emq_rows,
  count(*) filter (where format = 'sba') as sbas
from public.generated_questions;

-- 2. Move them to SBA, dropping the lead-in that only makes sense in a
--    set. Their content, citations and approval status are untouched.
update public.generated_questions
set format = 'sba',
    lead_in = null
where format = 'emq'
  and emq_group_id is null;

-- 3. Result.
select format, count(*)
from public.generated_questions
group by format;
