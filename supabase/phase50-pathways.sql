-- Phase 50: the pathway library for Ask Pinard (owner's brief, 11 October 2026).
--
-- Each clinical pathway (low-dose aspirin, VTE prophylaxis, GDM, each
-- medical condition in pregnancy...) is drawn out of the source library
-- once, in advance, as a structured record: when it applies, the risks
-- to mother and baby, the actions at each stage, drugs and doses, when to
-- refer, and for every item the stored passage it came from. Ask Pinard
-- then looks pathways up by the woman's risk factors instead of rebuilding
-- management from raw passages on every question.
--
-- Every pathway arrives as a draft. Only one the owner has approved in
-- Admin > Pathways drives a live answer. A pathway on the owner's list
-- that the sources do not contain is kept with status 'not_in_sources',
-- so the gap stays visible rather than being filled from elsewhere.
--
-- Admins only: nothing here is a candidate's, and the live app reads it
-- with the service role. Adds one table; changes and deletes nothing
-- else. Safe to run more than once.

create table if not exists public.pathways (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  area text not null check (area in ('obstetric', 'medical', 'gynaecology')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'needs_changes', 'not_in_sources')),
  -- Plain words a woman's risk factors are matched against.
  triggers text[] not null default '{}',
  -- The record: each field a list of { when?, text, chunks[], where? }.
  body jsonb not null default '{}'::jsonb,
  -- What the sources leave out, for the owner.
  gaps jsonb not null default '[]'::jsonb,
  -- Where two sources disagree: both positions, for the owner to choose.
  conflicts jsonb not null default '[]'::jsonb,
  source_document_ids bigint[] not null default '{}',
  -- What the checks removed from the draft, and why.
  removed jsonb not null default '[]'::jsonb,
  extracted_by text,
  extracted_at timestamptz,
  owner_note text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pathways_status_idx on public.pathways (status);

alter table public.pathways enable row level security;

drop policy if exists "pathways: admin full access" on public.pathways;
create policy "pathways: admin full access"
  on public.pathways
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
