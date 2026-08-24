-- ============================================================
-- PINARD — Phase 19: dismissing a superseded-guidance group
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- The superseded screen is a prompt to check, not a verdict, so some of
-- what it reports is correct to keep: a guideline reissued as a partial
-- update where both versions still apply, or two documents that look
-- alike and are not. Without a way to say "checked, keeping both",
-- those groups sit at the top of the list for ever and the screen stops
-- being read.
--
-- A group is identified by its members, so adding a document to a
-- reviewed group changes the key and brings it back for review — which
-- is the wanted behaviour: the new member has not been looked at.

create table if not exists public.superseded_reviews (
  group_key text primary key,
  document_ids bigint[] not null,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null
);

alter table public.superseded_reviews enable row level security;

-- Admin only, like every other content table.
drop policy if exists "superseded_reviews: admin read" on public.superseded_reviews;
create policy "superseded_reviews: admin read"
  on public.superseded_reviews for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "superseded_reviews: admin write" on public.superseded_reviews;
create policy "superseded_reviews: admin write"
  on public.superseded_reviews for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

comment on table public.superseded_reviews is
  'Groups the owner has checked and is happy to keep as they are. Keyed by the group members, so a changed group returns for review.';
