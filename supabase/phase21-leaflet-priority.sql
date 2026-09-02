-- ============================================================
-- PINARD — Phase 21: patient leaflets are background material
-- Paste into the Supabase SQL editor and Run (once).
--
-- Safe to re-run: it only ever lowers documents filed in a
-- patient-information section to priority 3.
-- ============================================================

-- Why: the tier of a newly uploaded document is guessed from its title
-- and source reference. A patient leaflet is titled after its condition
-- ("Ectopic pregnancy", "Pregnancy and breast cancer") and issued by
-- the RCOG, so that guess promoted 52 of them into priority 1 — the
-- examined core. Sessions inside six weeks of an exam draw 85% of their
-- questions from priority 1, so patient-facing material was competing
-- with the Green-top Guidelines for a candidate's last fortnight.
--
-- The section a document is filed under is the reliable signal, and
-- classifyPriority now reads it for new uploads. This fixes the ones
-- already in the library.

update public.content_documents d
set priority = 3
from public.sections s
left join public.sections p on p.id = s.parent_id
where d.section_id = s.id
  and d.priority <> 3
  and (
    s.title ilike '%patient information%'
    or s.title ilike '%leaflet%'
    or p.title ilike '%patient information%'
    or p.title ilike '%leaflet%'
  );

-- Check: every document in a patient-information section should now
-- report priority 3.
--
-- select s.title as section, d.priority, count(*)
-- from public.content_documents d
-- join public.sections s on s.id = d.section_id
-- where s.title ilike '%patient information%' or s.title ilike '%leaflet%'
-- group by s.title, d.priority
-- order by s.title, d.priority;
