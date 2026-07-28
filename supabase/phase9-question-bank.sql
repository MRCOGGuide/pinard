-- ============================================================
-- PINARD — Phase 9: approved question bank
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Which guideline(s) each question was generated from. Citation chunk
-- ids dangle after a re-ingest (chunks are replaced), so the document
-- link must be stored on the question itself: it survives re-ingestion,
-- which is exactly when you need it (guideline updated -> find and
-- replace its questions).
alter table public.generated_questions
  add column if not exists source_document_ids bigint[] not null default '{}';

create index if not exists generated_questions_source_docs_idx
  on public.generated_questions using gin (source_document_ids);

-- Backfill existing questions whose cited chunks still exist.
update public.generated_questions q
set source_document_ids = sub.doc_ids
from (
  select q2.id, array_agg(distinct c.document_id) as doc_ids
  from public.generated_questions q2
  join public.content_chunks c on c.id = any (q2.citation_chunk_ids)
  group by q2.id
) sub
where sub.id = q.id
  and q.source_document_ids = '{}';
