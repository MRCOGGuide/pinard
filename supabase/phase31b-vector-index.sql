-- ============================================================
-- Phase 31b — the vector index, in pieces that can survive being run.
--
-- phase31-vector-index.sql has been run and did not take: a
-- whole-library match_chunks still measures around four seconds and
-- sometimes exceeds the statement timeout, and a SECTION-FILTERED
-- search — which that file's own notes clocked at 0.71s before any of
-- this — is now four seconds too. If the section_id index had been
-- created, that one would be fast. So nothing in the file is in place,
-- which is what a rollback looks like.
--
-- The likely reason: the Supabase SQL editor runs a script as one
-- transaction. Building an HNSW index over 16,491 vectors of 1,024
-- dimensions takes minutes and runs into the statement timeout; that
-- one failure takes the section index and the function replacement
-- down with it, and the editor reports a single error that is easy to
-- read as a warning.
--
-- So: four steps, run ONE AT A TIME, each on its own. Step 1 says what
-- is actually there. Step 2 is the long one. Do not paste all four
-- together.
-- ============================================================


-- ------------------------------------------------------------
-- STEP 1 — what is there now. Run this alone, first and last.
-- ------------------------------------------------------------
-- Expect, after step 2: one row, content_chunks_embedding_hnsw.

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'content_chunks'
order by indexname;


-- ------------------------------------------------------------
-- STEP 2 — the index. Run this ALONE. It takes minutes.
-- ------------------------------------------------------------
-- The two settings are the point of this file. Without the first the
-- build is killed partway; without the second it builds far more
-- slowly than it needs to, which is what provokes the first.
--
-- Both are per-session and revert when the editor tab is closed.

set statement_timeout = '30min';
set maintenance_work_mem = '512MB';

create index if not exists content_chunks_embedding_hnsw
  on public.content_chunks
  using hnsw (embedding vector_cosine_ops);


-- ------------------------------------------------------------
-- STEP 3 — the section index. Seconds, not minutes.
-- ------------------------------------------------------------
-- A filtered search is applied after the index scan, so a narrow
-- section can return fewer rows than asked for. This lets the planner
-- filter first instead, where that is cheaper.

create index if not exists content_chunks_section_id_idx
  on public.content_chunks (section_id);


-- ------------------------------------------------------------
-- STEP 4 — the function, so it explores enough of the graph.
-- ------------------------------------------------------------
-- ef_search bounds how much of the HNSW graph a query walks. The
-- default of 40 is below the 50 match_chunks will accept as
-- match_count, which quietly costs recall on the largest requests.

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
set hnsw.ef_search = 120
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


-- ------------------------------------------------------------
-- Then, from the repository:  npm run preflight
-- ------------------------------------------------------------
-- "Vector search indexed: whole-library search in NNms" is what done
-- looks like. Anything still measured in seconds means step 2 did not
-- complete, whatever the editor said.
