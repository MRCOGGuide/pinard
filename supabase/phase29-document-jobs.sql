-- ============================================================
-- PINARD — Phase 29: a job can name one document
-- Paste into the Supabase SQL editor and Run (once).
--
-- A job has always been a section and a format: "make 15 SBAs for
-- Contraception". That is the right unit for guidance, where a section
-- is a handful of guidelines and covering the section covers them all.
--
-- It is the wrong unit for TOG. The TOG Articles section holds 5324
-- chunks across 342 citable articles, each a separate paper on its own
-- subject, and a section-wide job spreads a target of 30 across them
-- however the passage sampling happens to fall — 340 of those 342
-- articles have never produced a single question. An article is the
-- unit a candidate revises and the unit the exam draws on, so it has to
-- be the unit a job is written against.
--
-- With a document_id set, the job generates from that document alone.
-- Null means what it has always meant: the whole section.
-- ============================================================

alter table public.generation_jobs
  add column if not exists document_id bigint
  references public.content_documents (id) on delete cascade;

comment on column public.generation_jobs.document_id is
  'Optional: generate from this document alone rather than the whole section. Used for TOG articles, where each paper is its own subject and a section-wide job leaves most of them unexamined.';

-- The queue takes jobs in id order, so inserting newest-first is what
-- makes recent issues generate first. This index is for the dedupe
-- check — "is this article already queued?" — which runs once per
-- article when the queue is filled.
create index if not exists generation_jobs_document_id_idx
  on public.generation_jobs (document_id)
  where document_id is not null;
