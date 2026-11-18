-- Phase 59: a link to each source's official page (L7.3; owner, 18 November 2026: "Yes, add the column").
--
-- Ask Pinard and the question cards name the guideline an answer comes
-- from; this lets them link to it as well, the way AI search tools link
-- what they cite: the NICE page, the RCOG page or the journal's DOI page.
-- One new column on the library's document table, empty until filled.
-- Nothing else changes and nothing is deleted. Admins set it in
-- Admin > Sources; the server fills it where the reference already
-- gives it (a DOI or a NICE code).
--
-- Only https links are accepted.

alter table public.content_documents
  add column if not exists official_url text;

alter table public.content_documents
  drop constraint if exists content_documents_official_url_https;
alter table public.content_documents
  add constraint content_documents_official_url_https
  check (official_url is null or official_url ~ '^https://[^\s]+$');

-- Check (read only): should return one row, "official_url | text".
--
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'content_documents' and column_name = 'official_url';
