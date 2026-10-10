-- Phase 48: Ask Pinard reviews (owner's request, 10 October 2026).
--
-- The owner tests Ask Pinard from Admin > Ask Pinard and marks each
-- answer Good, Needs work or Wrong, with a note and what it should have
-- said. Each test is kept here with its timings, the passages that were
-- retrieved and anything the checks turned back, so every fault can be
-- traced to its cause: the library (the guidance is missing), the search
-- (the right passage was not found) or the model (it was found and
-- misread). The same questions are then asked again after each fix
-- (scripts/eval-ask.mts) to show what improved and that nothing got worse.
--
-- Admins only: nothing here is a candidate's. Adds one table; changes
-- and deletes nothing else. Safe to run more than once.

create table if not exists public.ask_reviews (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  question text not null,
  reply text,
  sources jsonb not null default '[]'::jsonb,
  passages jsonb not null default '[]'::jsonb,
  retrieval_ms integer,
  total_ms integer,
  attempts integer,
  problems jsonb not null default '[]'::jsonb,
  ok boolean not null default false,
  failure text,
  rating text check (rating in ('good', 'needs_work', 'wrong')),
  note text,
  expected text,
  rated_at timestamptz
);

create index if not exists ask_reviews_created_idx on public.ask_reviews (created_at desc);

alter table public.ask_reviews enable row level security;

drop policy if exists "ask_reviews: admin full access" on public.ask_reviews;
create policy "ask_reviews: admin full access"
  on public.ask_reviews
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
