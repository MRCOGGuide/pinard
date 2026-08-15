-- ============================================================
-- PINARD — Phase 14: widen what counts as core guidance
-- Paste into the Supabase SQL editor and Run (once).
-- Safe to re-run. Requires phase13 to have been run first.
-- ============================================================

-- Guidance for practice is core whoever issued it, so anything called
-- a guideline qualifies (e.g. ESC's "Management of cardiovascular
-- disease and pregnancy"), as does CoSRH (the current name for FSRH),
-- BSGE / BGCS / BMS and GOV.UK material. Statements, position papers
-- and consensus documents remain supporting unless titled a guideline.
--
-- TOG issue content and background material (corrections, leaflets,
-- "Spotlight on...", letters) keep the tier phase13 gave them.

-- 1. Preview the effect before committing to it.
select
  count(*) filter (where priority = 1) as core_now,
  count(*) filter (where priority = 2) as supporting_now,
  count(*) filter (where priority = 3) as background_now
from public.content_documents;

-- 2. Promote to core.
update public.content_documents
set priority = 1
where priority = 2
  and tog_category is null
  and (
    -- Titled a guideline: core regardless of issuer.
    title ~* '\mguidelines?\M'
    or source_reference ~* '\mguidelines?\M'
    -- Named bodies whose guidance is examined directly.
    or source_reference ~* '\mCoSRH\M|\mFSRH\M|\mBSGE\M|\mBGCS\M|\mBMS\M|british menopause society|\mGOV\.?UK\M'
    or title ~* '\mCoSRH\M|\mFSRH\M|\mBSGE\M|\mBGCS\M|\mBMS\M|british menopause society|\mGOV\.?UK\M'
  )
  -- ...but a statement is supporting unless it is itself a guideline.
  and not (
    (title ~* '\mstatements?\M|position paper|\mconsensus\M'
     or source_reference ~* '\mstatements?\M|position paper|\mconsensus\M')
    and title !~* '\mguidelines?\M'
    and source_reference !~* '\mguidelines?\M'
  );

-- 3. Demote statements that phase13 promoted to core but which are not
--    themselves guidelines.
update public.content_documents
set priority = 2
where priority = 1
  and tog_category is null
  and (title ~* '\mstatements?\M|position paper|\mconsensus\M'
       or source_reference ~* '\mstatements?\M|position paper|\mconsensus\M')
  and title !~* '\mguidelines?\M'
  and source_reference !~* '\mguidelines?\M';

-- 4. Re-derive question priority from their sources.
update public.generated_questions q
set priority = sub.priority
from (
  select q2.id, min(d.priority) as priority
  from public.generated_questions q2
  join public.content_documents d on d.id = any (q2.source_document_ids)
  group by q2.id
) sub
where sub.id = q.id
  and q.priority is distinct from sub.priority;

-- 5. Result.
select
  count(*) filter (where priority = 1) as core_after,
  count(*) filter (where priority = 2) as supporting_after,
  count(*) filter (where priority = 3) as background_after
from public.content_documents;
