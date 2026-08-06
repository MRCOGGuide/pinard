-- ============================================================
-- PINARD — Phase 10: TOG issue organisation
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- TOG (The Obstetrician & Gynaecologist) is a quarterly journal:
-- 4 issues/year (Jan, Apr, Jul, Oct), each holding articles, CPD
-- questions, letters & replies, and an MBRRACE/UKOSS update. Rather
-- than modelling issues as syllabus sections (which would pollute the
-- study plan), each uploaded document can carry its TOG identity, and
-- the source library groups by year → issue → category.
alter table public.content_documents
  add column if not exists tog_year int,
  add column if not exists tog_issue int
    check (tog_issue is null or tog_issue between 1 and 4),
  add column if not exists tog_category text
    check (
      tog_category is null
      or tog_category in ('article', 'cpd', 'letters', 'update')
    );

create index if not exists content_documents_tog_idx
  on public.content_documents (tog_year desc, tog_issue desc)
  where tog_year is not null;
