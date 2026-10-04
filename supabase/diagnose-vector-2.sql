-- ============================================================
-- One query. The index is fine; the function is not.
--
-- What is now known:
--   the index exists and is used    9ms, from your EXPLAIN
--   a trivial round trip            84ms, measured from here
--   match_chunks over the same data 5,300ms, measured from here
--
-- So the five seconds is inside the function, not inside the query I
-- asked you to EXPLAIN last time: that one was the query written out
-- by hand, with the vector as a literal. match_chunks takes it as a
-- parameter, and carries `set hnsw.ef_search = 120`, which stops
-- PostgreSQL inlining the function and makes it plan the body on its
-- own.
--
-- This asks the database to plan the FUNCTION. Run it and send the
-- result. The first line under the function call is the answer:
--
--   "Index Scan using content_chunks_embedding_hnsw"  -> the fault is
--      elsewhere and I will keep looking
--   "Seq Scan on content_chunks"                      -> the SET
--      clause or the parameter is costing the index, and the fix is in
--      the function rather than in the index
-- ============================================================

explain (analyze, buffers)
select *
from public.match_chunks(
  array_fill(0.01::real, array[1024])::vector,
  null,
  8
);
