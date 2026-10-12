-- Phase 51: decision aids (owner's direction, 12 October 2026).
--
-- The guidelines already hold the decision logic a clinician follows:
-- flowcharts, algorithms and tables, often in the appendices (the VTE
-- risk assessment chart, the chickenpox contact algorithm, the timing of
-- birth table). Each is transcribed here as drawn, boxes and arrows or
-- rows and cells, with a crisp image of the original beside it, checked
-- three ways (wording against the page, structure against the image,
-- content against the guideline's text), and approved by the owner
-- before Ask Pinard follows it.
--
-- Admins only; the live app reads it with the service role. Adds one
-- table; changes and deletes nothing else. Safe to run more than once.

create table if not exists public.decision_aids (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.content_documents (id) on delete cascade,
  page integer not null,
  position integer not null default 1,
  title text not null,
  kind text not null check (kind in ('flowchart', 'table', 'box')),
  -- The clinical decision it guides, and who or what calls for it.
  decision text not null default '',
  applies_to text[] not null default '{}',
  -- Flowchart: { nodes: [{id, text, kind}], edges: [{from, to, label}] }.
  -- Table or box: { columns: [], rows: [[]] }. Both may carry footnotes.
  content jsonb not null default '{}'::jsonb,
  -- What the checks found, for the owner: [{ source, detail }].
  flags jsonb not null default '[]'::jsonb,
  -- Crops of the original page(s) in the "sources" storage bucket.
  image_paths text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'needs_changes', 'rejected')),
  owner_note text,
  extracted_by text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, page, position)
);

create index if not exists decision_aids_status_idx on public.decision_aids (status);
create index if not exists decision_aids_document_idx on public.decision_aids (document_id);

alter table public.decision_aids enable row level security;

drop policy if exists "decision_aids: admin full access" on public.decision_aids;
create policy "decision_aids: admin full access"
  on public.decision_aids
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
