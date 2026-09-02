-- ============================================================
-- PINARD — Phase 20: generation queue
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- A standing instruction to generate questions for one section until
-- it holds `target` of them. The worker picks jobs up a few at a time,
-- so progress survives a closed tab, a timeout or a deploy: whatever
-- was created is already in the review queue and `created` says so.
create table if not exists public.generation_jobs (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections (id) on delete cascade,
  format public.question_format not null,
  -- Questions wanted from this job (EMQ sets count their scenarios).
  target int not null check (target between 1 and 200),
  created int not null default 0,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  -- Consecutive runs that produced nothing. A section whose passages
  -- cannot support more questions must stop asking, not spend the API
  -- budget discovering it again every time the worker wakes.
  empty_runs int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generation_jobs_status_idx
  on public.generation_jobs (status, id);

alter table public.generation_jobs enable row level security;

drop policy if exists "generation_jobs: admin only" on public.generation_jobs;
create policy "generation_jobs: admin only"
  on public.generation_jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
