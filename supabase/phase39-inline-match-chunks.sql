-- ============================================================
-- Phase 39 — let PostgreSQL inline match_chunks.
--
-- RUN THIS ONLY IF diagnose-vector-2.sql says "Seq Scan on
-- content_chunks" inside the function. If it says "Index Scan using
-- content_chunks_embedding_hnsw" then this is not the fault and this
-- file would lower recall for nothing.
--
-- The one difference from phase 31b: no `set hnsw.ef_search = 120`.
--
-- A SQL function carrying a SET clause cannot be inlined. Without
-- inlining the body is planned on its own, with the query vector as a
-- run-time parameter rather than the constant the hand-written query
-- had — and the hand-written query is the one that returned in 9ms on
-- an index scan while the function took five seconds over the same
-- rows. Inlined, the function becomes that query.
--
-- What is given up: ef_search falls back to its default of 40, which
-- bounds how much of the HNSW graph a search walks and must be at
-- least as large as the number of rows asked for. The app's largest
-- request is 36 — Ask Pinard asks for 12 and retrieval over-fetches by
-- three — so 40 is above everything this application sends. The cap
-- inside the function still allows 50, which would be walked with
-- ef_search 40 and lose a little recall; nothing calls it with more
-- than 36, and if that changes, raise ef_search per session at the
-- caller rather than putting the SET back on the function.
-- ============================================================

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

-- Then, from the repository:  npm run preflight
-- "Vector search indexed: whole-library search in NNms" is what done
-- looks like, and NN should now be a hundred or two rather than five
-- thousand: the database's 9ms plus the round trip.
