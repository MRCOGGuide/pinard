-- ============================================================
-- PINARD — Phase 11: record completed fact extraction
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Some documents legitimately contain no quantifiable facts (letters,
-- editorials, 1–2-chunk articles). Recording WHEN fact extraction
-- last completed cleanly lets "Partially ingested" mean what it
-- should: extraction never finished — not "found nothing".
alter table public.content_documents
  add column if not exists facts_extracted_at timestamptz;

-- Backfill: every document that has chunks has been through fact
-- extraction by now (the post-API-restore sweep), so mark them done.
update public.content_documents d
set facts_extracted_at = now()
where facts_extracted_at is null
  and exists (
    select 1 from public.content_chunks c where c.document_id = d.id
  );
