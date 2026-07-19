-- ============================================================
-- PINARD — Phase 3: retrieval + ingestion stats
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Top chunks by cosine similarity for a query embedding, optionally
-- restricted to given sections, with document title + reference.
create or replace function public.match_chunks(
  query_embedding vector(1024),
  section_ids bigint[] default null,
  match_count int default 8
)
returns table (
  chunk_id bigint,
  document_id bigint,
  section_id bigint,
  chunk_index int,
  text text,
  similarity double precision,
  document_title text,
  source_reference text
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.section_id,
    c.chunk_index,
    c.text,
    1 - (c.embedding <=> query_embedding),
    d.title,
    d.source_reference
  from public.content_chunks c
  join public.content_documents d on d.id = c.document_id
  where c.embedding is not null
    and (section_ids is null or c.section_id = any (section_ids))
  order by c.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

-- Chunk and key-fact counts per document, for the Source library.
create or replace function public.document_ingest_stats()
returns table (
  document_id bigint,
  chunk_count bigint,
  fact_count bigint
)
language sql
stable
as $$
  select
    c.document_id,
    count(distinct c.id),
    count(f.id)
  from public.content_chunks c
  left join public.key_facts f on f.chunk_id = c.id
  group by c.document_id;
$$;
