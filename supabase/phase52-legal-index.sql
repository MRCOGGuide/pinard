-- Phase 52: the legal index (the owner's brief, part 4).
--
-- Every law, legal case and piece of professional or regulatory guidance
-- named in the library, with what it establishes and where it appears.
-- When a question raises a legal point, Ask Pinard finds the entries that
-- bear on it here and applies them to the case. Only an entry the owner
-- has approved is used.
--
-- Admins only; the live app reads it with the service role. Adds one
-- table; changes and deletes nothing else. Safe to run more than once.

create table if not exists public.legal_index (
  id bigint generated always as identity primary key,
  name text not null unique,
  kind text not null check (kind in ('law', 'case', 'guidance')),
  -- Where it applies, where the sources say: England and Wales, Scotland...
  jurisdiction text not null default '',
  -- What it establishes, written from what the sources say about it.
  establishes text not null default '',
  topics text[] not null default '{}',
  -- Where it appears: [{ document_id, chunk_id, statement }].
  mentions jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'needs_changes', 'rejected')),
  owner_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists legal_index_status_idx on public.legal_index (status);

alter table public.legal_index enable row level security;

drop policy if exists "legal_index: admin full access" on public.legal_index;
create policy "legal_index: admin full access"
  on public.legal_index
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
