-- ============================================================
-- PINARD — Phase 2b: true EMQ structure
-- Paste into the Supabase SQL editor and Run (once).
--
-- A real MRCOG EMQ is a set: one shared option list + a lead-in
-- instruction + several numbered scenarios answered from that
-- list. Each scenario remains one row; rows in the same set share
-- lead_in, options and emq_group_id.
-- ============================================================

alter table public.example_questions
  add column if not exists lead_in text,
  add column if not exists emq_group_id uuid;

alter table public.generated_questions
  add column if not exists lead_in text,
  add column if not exists emq_group_id uuid;

create index if not exists example_questions_emq_group_idx
  on public.example_questions (emq_group_id);
create index if not exists generated_questions_emq_group_idx
  on public.generated_questions (emq_group_id);
