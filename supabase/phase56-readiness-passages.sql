-- ============================================================
-- PINARD — Phase 56: facts per passage, for readiness
-- Paste into the Supabase SQL editor and Run (once). Safe to run again.
-- ============================================================
--
-- Why (owner, 16 November 2026): readiness should reflect knowledge, so
-- it is counted in the facts the library extracted from each guideline
-- (key_facts), not in pages or questions. There are some 65,000 facts;
-- reading them through the API takes about thirteen seconds, too long for
-- a page. This function counts them in the database and returns, in one
-- call, each passage's guideline and how many facts it holds.
--
-- What it adds, and nothing else: one read-only function. It changes no
-- table and no data. Only the server (the service role) may call it;
-- candidates cannot, as the library is not theirs to read. Until it is
-- run, readiness assumes four facts a page, the library's median.

create or replace function public.readiness_passages()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(c.id, jsonb_build_array(c.document_id, coalesce(f.n, 0))),
    '{}'::jsonb
  )
  from public.content_chunks c
  left join (
    select chunk_id, count(*)::int as n
    from public.key_facts
    group by chunk_id
  ) f on f.chunk_id = c.id;
$$;

revoke all on function public.readiness_passages() from public, anon, authenticated;
grant execute on function public.readiness_passages() to service_role;
