-- ============================================================
-- PINARD — Phase 4: generation failure log
-- Paste into the Supabase SQL editor and Run (once).
--
-- Every generation/verification failure (after retries) is logged
-- here for admin review — surfaced on the Review queue and, later,
-- the admin Dashboard (PROJECT.md section 7).
-- ============================================================

create table if not exists public.generation_failures (
  id bigint generated always as identity primary key,
  section_id bigint references public.sections (id) on delete set null,
  format public.question_format,
  reason text not null,          -- e.g. "verification: invalid citations, americanism 'labor'"
  raw_response text,             -- the model's last raw output, for debugging
  created_at timestamptz not null default now(),
  resolved boolean not null default false
);

create index if not exists generation_failures_section_idx
  on public.generation_failures (section_id);
create index if not exists generation_failures_resolved_idx
  on public.generation_failures (resolved);

alter table public.generation_failures enable row level security;

create policy "generation_failures: admin only"
  on public.generation_failures for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
