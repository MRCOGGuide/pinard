-- ============================================================
-- PINARD — Phase 17: candidate question flags
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- A candidate flags a question to come back to it. One row per user per
-- question; unflagging deletes the row, so the table only ever holds
-- what is currently flagged.
create table if not exists public.user_question_flags (
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id bigint not null references public.generated_questions (id) on delete cascade,
  flagged_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists user_question_flags_user_idx
  on public.user_question_flags (user_id, flagged_at desc);

alter table public.user_question_flags enable row level security;

-- ---------- user_question_flags (own rows) ----------
drop policy if exists "user_question_flags: read own" on public.user_question_flags;
create policy "user_question_flags: read own"
  on public.user_question_flags for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_question_flags: insert own" on public.user_question_flags;
create policy "user_question_flags: insert own"
  on public.user_question_flags for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user_question_flags: delete own" on public.user_question_flags;
create policy "user_question_flags: delete own"
  on public.user_question_flags for delete to authenticated
  using (user_id = auth.uid());
