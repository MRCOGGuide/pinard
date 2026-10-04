-- ============================================================
-- PINARD — Phase 31: an index for the vector search
--
-- This file worked. The index it builds exists and the planner uses
-- it: 9ms over 16,491 chunks, against 4.5 to 6.6 seconds before.
--
-- One line of it was a mistake. `set hnsw.ef_search = 120` on the
-- function stops PostgreSQL inlining it, so the body was planned on
-- its own with the query vector as a run-time parameter, and the index
-- went unused inside the very function the index was built for:
-- 5,117ms, 57,803 buffers and a sort spilled to disk, while the same
-- query written out by hand took 9ms. phase39-inline-match-chunks.sql
-- removes that line and is the version now in the database.
--
-- The reasoning below about WHY the index is needed still stands.
--
-- match_chunks has never had an index. It reads every row of
-- content_chunks, computes a 1024-dimension cosine distance for each,
-- sorts them, and returns eight. At 16,491 chunks that measures
-- 4.5 to 6.6 seconds, against the 8-second statement timeout the
-- authenticated role runs under — so it fails sometimes and works
-- sometimes, which is the worst way for it to fail.
--
-- Generation never hit it because generation passes section_ids and
-- searches one section: 0.71s. Ask Pinard passes null and searches the
-- whole library, so the ask box is the only caller paying the full
-- scan, and it is the one that broke. Asking about the management of
-- CMV in pregnancy timed out twice and reported that the source
-- material did not cover it.
--
-- HNSW rather than IVFFlat: no lists to tune, no retraining as the
-- corpus grows, and better recall at the same speed. vector_cosine_ops
-- because match_chunks orders by <=>; an index built for a different
-- operator is simply not used, silently.
-- ============================================================

create index if not exists content_chunks_embedding_hnsw
  on public.content_chunks
  using hnsw (embedding vector_cosine_ops);

comment on index public.content_chunks_embedding_hnsw is
  'Approximate nearest-neighbour index for match_chunks. Must match the <=> operator the function orders by.';

-- A filtered search — generation asking for one section — is applied
-- after the index scan, so a narrow section can return fewer rows than
-- asked for. Giving the planner a section_id index means it can choose
-- to filter first instead, which is what it should do when a section is
-- a small share of the corpus.
create index if not exists content_chunks_section_id_idx
  on public.content_chunks (section_id);

-- ef_search bounds how much of the graph a query explores. The default
-- of 40 is below the 50 match_chunks will accept as match_count, which
-- would quietly cost recall on the largest requests. 120 restores the
-- margin and still returns in milliseconds.
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

-- After running this, confirm from the app's side rather than from
-- here: npx tsx scripts/check-retrieval.mts
