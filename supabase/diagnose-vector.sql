-- ============================================================
-- Why is the vector search still scanning?
--
-- Run this whole file in the Supabase SQL editor and send me what the
-- four results say. It changes nothing: four questions, no writes.
--
-- The index has been created twice now and match_chunks still takes
-- four to five seconds, which leaves three possibilities, and these
-- four questions tell them apart:
--
--   A. The index does not exist, because the build failed.
--   B. pgvector here is too old to have HNSW at all, in which case
--      `using hnsw` errors and IVFFlat is the fallback.
--   C. The index exists and the planner is not choosing it, which is a
--      different problem with a different fix.
-- ============================================================


-- ---- 1. Which pgvector, and does it have HNSW? --------------
-- HNSW arrived in pgvector 0.5.0. Below that, the create in phase 31
-- cannot have worked whatever the editor reported.

select
  extname,
  extversion
from pg_extension
where extname = 'vector';


-- ---- 2. What indexes are actually on the table? -------------
-- Expect content_chunks_embedding_hnsw and content_chunks_section_id_idx.
-- An empty result is answer A.

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'content_chunks'
order by indexname;


-- ---- 3. Is the index being used? ----------------------------
-- The query match_chunks runs, planned and timed. Read the first line:
--
--   "Index Scan using content_chunks_embedding_hnsw"  the index is used
--   "Seq Scan on content_chunks"                      it is not
--
-- The zero vector is only there to make a valid query; the plan is the
-- answer, not the rows.

explain (analyze, buffers)
select
  c.id,
  1 - (c.embedding <=> array_fill(0.01::real, array[1024])::vector) as similarity
from public.content_chunks c
where c.embedding is not null
order by c.embedding <=> array_fill(0.01::real, array[1024])::vector
limit 8;


-- ---- 4. The same, as match_chunks actually writes it ---------
-- With the join and the non-constant limit, which are the two things
-- that could stop the planner choosing an index that does exist.

explain (analyze, buffers)
select
  c.id,
  d.title
from public.content_chunks c
join public.content_documents d on d.id = c.document_id
where c.embedding is not null
order by c.embedding <=> array_fill(0.01::real, array[1024])::vector
limit least(8, 50);
