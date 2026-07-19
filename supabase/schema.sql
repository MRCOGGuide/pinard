-- ============================================================
-- PINARD — full database schema (PROJECT.md section 6)
-- Paste this whole file into the Supabase SQL editor and Run.
-- Safe to run once on a fresh project.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists vector;

-- ---------- Enums ----------
create type public.user_role as enum ('admin', 'user');
create type public.exam_part as enum ('part1', 'part2', 'part3');
create type public.question_format as enum ('sba', 'emq');
create type public.question_status as enum ('pending', 'approved', 'rejected');
create type public.mastery_level as enum ('weak', 'developing', 'secure');
create type public.document_status as enum ('uploaded', 'processing', 'ingested', 'failed');
create type public.subscription_provider as enum ('stripe', 'apple', 'google');

-- ============================================================
-- Tables
-- ============================================================

-- profiles — one row per auth user, created automatically on sign-up
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role public.user_role not null default 'user',
  exam public.exam_part,
  exam_date date,
  created_at timestamptz not null default now()
);

-- sections — exams, sections and sub-topics (parent_id for sub-topics)
create table public.sections (
  id bigint generated always as identity primary key,
  exam public.exam_part not null,
  title text not null,
  parent_id bigint references public.sections (id) on delete cascade,
  sort_order int not null default 0,
  is_active boolean not null default true
);

-- content_documents — owner-uploaded source material
create table public.content_documents (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections (id) on delete cascade,
  title text not null,
  source_reference text not null, -- e.g. "RCOG GTG No. 37a, 2015"
  source_year int,
  file_url text,
  status public.document_status not null default 'uploaded',
  uploaded_at timestamptz not null default now()
);

-- content_chunks — RAG chunks with Voyage embeddings (1024 dims)
create table public.content_chunks (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.content_documents (id) on delete cascade,
  section_id bigint not null references public.sections (id) on delete cascade,
  chunk_index int not null,
  text text not null,
  embedding vector(1024),
  token_count int
);

-- key_facts — extracted facts; powers the "Similar Values" panel
create table public.key_facts (
  id bigint generated always as identity primary key,
  chunk_id bigint not null references public.content_chunks (id) on delete cascade,
  section_id bigint not null references public.sections (id) on delete cascade,
  subject text not null,
  fact_type text not null, -- e.g. risk, incidence, dose, threshold, sensitivity
  value_numeric numeric,
  value_text text,
  statement text not null,
  source_reference text
);

-- example_questions — style templates only, never shown to users.
-- EMQ sets: one row per scenario; rows in the same set share
-- options, lead_in and emq_group_id (null for SBAs).
create table public.example_questions (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections (id) on delete cascade,
  format public.question_format not null,
  stem text not null,
  options jsonb not null,
  correct_key text not null,
  rationale text,
  source_note text,
  lead_in text,
  emq_group_id uuid
);

-- generated_questions — AI output awaiting/after the admin review gate
create table public.generated_questions (
  id bigint generated always as identity primary key,
  section_id bigint not null references public.sections (id) on delete cascade,
  format public.question_format not null,
  stem text not null,
  options jsonb not null,
  correct_key text not null,
  explanations jsonb not null, -- per option, each with citation ids
  difficulty int check (difficulty between 1 and 5),
  citation_chunk_ids bigint[] not null default '{}',
  status public.question_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  lead_in text,
  emq_group_id uuid
);

-- user_answers — every attempt
create table public.user_answers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id bigint not null references public.generated_questions (id) on delete cascade,
  chosen_key text not null,
  is_correct boolean not null,
  seconds_taken int,
  session_id uuid,
  answered_at timestamptz not null default now()
);

-- user_topic_performance — rolling accuracy per section
create table public.user_topic_performance (
  user_id uuid not null references public.profiles (id) on delete cascade,
  section_id bigint not null references public.sections (id) on delete cascade,
  rolling_accuracy numeric not null default 0,
  attempts int not null default 0,
  last_practised_at timestamptz,
  mastery public.mastery_level not null default 'weak',
  primary key (user_id, section_id)
);

-- study_plans — generated plan JSON + Claude-written narrative
create table public.study_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  generated_at timestamptz not null default now(),
  plan jsonb not null, -- weeks → days → section_ids + question targets
  narrative text
);

-- chat_messages — follow-up tutor chat, scoped per question
create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id bigint not null references public.generated_questions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- subscriptions — maintained by Stripe/RevenueCat webhooks (service role)
create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider public.subscription_provider not null,
  status text not null,
  tier text not null,
  current_period_end timestamptz
);

-- notifications_log — what was sent, when
create table public.notifications_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  sent_at timestamptz not null default now()
);

-- ---------- Indexes ----------
create index sections_parent_idx on public.sections (parent_id);
create index sections_exam_idx on public.sections (exam);
create index content_documents_section_idx on public.content_documents (section_id);
create index content_chunks_document_idx on public.content_chunks (document_id);
create index content_chunks_section_idx on public.content_chunks (section_id);
create index key_facts_chunk_idx on public.key_facts (chunk_id);
create index key_facts_section_idx on public.key_facts (section_id);
create index key_facts_value_numeric_idx on public.key_facts (value_numeric);
create index key_facts_value_text_idx on public.key_facts (value_text);
create index example_questions_section_idx on public.example_questions (section_id);
create index generated_questions_section_idx on public.generated_questions (section_id);
create index generated_questions_status_idx on public.generated_questions (status);
create index user_answers_user_idx on public.user_answers (user_id);
create index user_answers_question_idx on public.user_answers (question_id);
create index study_plans_user_idx on public.study_plans (user_id);
create index chat_messages_user_question_idx on public.chat_messages (user_id, question_id);
create index notifications_log_user_idx on public.notifications_log (user_id);

-- ============================================================
-- Auth plumbing
-- ============================================================

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- True when the calling user has the admin role.
-- SECURITY DEFINER so it can read profiles without tripping RLS recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Stop users promoting themselves. Changes made in the SQL editor or by
-- the service role (auth.uid() is null there) are still allowed — that is
-- how the owner makes the first admin.
create or replace function public.protect_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end;
$$;

create trigger protect_role_change
  before update on public.profiles
  for each row execute function public.protect_role_change();

-- ============================================================
-- Row-level security — ON everywhere.
-- Users read/write only their own rows; admin required for all
-- content, example, review and section tables.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.content_documents enable row level security;
alter table public.content_chunks enable row level security;
alter table public.key_facts enable row level security;
alter table public.example_questions enable row level security;
alter table public.generated_questions enable row level security;
alter table public.user_answers enable row level security;
alter table public.user_topic_performance enable row level security;
alter table public.study_plans enable row level security;
alter table public.chat_messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications_log enable row level security;

-- ---------- profiles ----------
create policy "profiles: read own (admin reads all)"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: update own (admin updates all)"
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- sections (admin manages; users see active ones) ----------
create policy "sections: admin full access"
  on public.sections for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "sections: users read active"
  on public.sections for select to authenticated
  using (is_active);

-- ---------- content_documents (admin only) ----------
create policy "content_documents: admin only"
  on public.content_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- content_chunks (admin only) ----------
create policy "content_chunks: admin only"
  on public.content_chunks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- key_facts (admin manages; users read for Similar Values) ----------
create policy "key_facts: admin full access"
  on public.key_facts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "key_facts: users read"
  on public.key_facts for select to authenticated
  using (true);

-- ---------- example_questions (admin only — never shown to users) ----------
create policy "example_questions: admin only"
  on public.example_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- generated_questions (admin manages; users see approved) ----------
create policy "generated_questions: admin full access"
  on public.generated_questions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "generated_questions: users read approved"
  on public.generated_questions for select to authenticated
  using (status = 'approved');

-- ---------- user_answers (own rows; admin reads for dashboard) ----------
create policy "user_answers: read own (admin reads all)"
  on public.user_answers for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_answers: insert own"
  on public.user_answers for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- user_topic_performance (own rows) ----------
create policy "user_topic_performance: read own (admin reads all)"
  on public.user_topic_performance for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_topic_performance: insert own"
  on public.user_topic_performance for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_topic_performance: update own"
  on public.user_topic_performance for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- study_plans (own rows) ----------
create policy "study_plans: read own (admin reads all)"
  on public.study_plans for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "study_plans: insert own"
  on public.study_plans for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- chat_messages (own rows) ----------
create policy "chat_messages: read own"
  on public.chat_messages for select to authenticated
  using (user_id = auth.uid());

create policy "chat_messages: insert own"
  on public.chat_messages for insert to authenticated
  with check (user_id = auth.uid());

-- ---------- subscriptions (users read own; writes via service role only) ----------
create policy "subscriptions: read own (admin reads all)"
  on public.subscriptions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------- notifications_log (users read own; writes via service role only) ----------
create policy "notifications_log: read own (admin reads all)"
  on public.notifications_log for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
