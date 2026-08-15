-- ============================================================
-- PINARD — Phase 13: source priority tiers
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- 1 = core guidance (RCOG/GTG, NICE, FSRH, BASHH, Scientific Impact
--     Papers) — the examined core
-- 2 = supporting (TOG articles, specialist societies, governance)
-- 3 = background (patient leaflets, corrections, editorials)
alter table public.content_documents
  add column if not exists priority smallint not null default 2
    check (priority between 1 and 3);

-- Questions carry the priority of the material they were written from,
-- so session selection can favour core guidance without joining back
-- to documents on every pick.
alter table public.generated_questions
  add column if not exists priority smallint not null default 2
    check (priority between 1 and 3);

create index if not exists generated_questions_priority_idx
  on public.generated_questions (section_id, status, priority);

-- ---------- backfill documents ----------
-- Background first: a "Correction to <GTG>" is not core material.
update public.content_documents
set priority = 3
where title ~* '^(correction to|re:|author''?s reply|spotlight on)'
   or title ~* 'patient information|leaflet'
   or source_reference ~* 'patient information|leaflet';

-- TOG issue content is supporting; its letters/CPD are background.
update public.content_documents
set priority = case when tog_category in ('article', 'update') then 2 else 3 end
where tog_category is not null
  and priority <> 3;

-- The examined core.
update public.content_documents
set priority = 1
where priority = 2
  and tog_category is null
  and (
    source_reference ~* 'green[ -]?top|\mGTG\M|\mNICE\M|\mFSRH\M|\mBASHH\M|\mUKMEC\M|scientific impact|\mRCOG\M'
    or title ~* 'green[ -]?top|\mGTG\M|\mNICE\M|\mFSRH\M|\mBASHH\M|\mUKMEC\M|scientific impact'
  );

-- ---------- backfill existing questions ----------
-- A question is as important as the most important source it cites.
update public.generated_questions q
set priority = sub.priority
from (
  select q2.id, min(d.priority) as priority
  from public.generated_questions q2
  join public.content_documents d on d.id = any (q2.source_document_ids)
  group by q2.id
) sub
where sub.id = q.id;
