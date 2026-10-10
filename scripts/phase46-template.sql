-- Phase 46: the free sample diagnostic, the same fixed questions for
-- every free candidate (owner's decision, 10 October 2026).
--
-- {{GENERATED}}
--
-- What it does:
--   1. A new table, free_diagnostic_items: the pinned questions, in the
--      order they are asked. Readable by any signed-in account (it holds
--      only question numbers); changed only by this file or the service
--      role.
--   2. The question bank's read rule gains one clause: a signed-in
--      account may also read the pinned diagnostic questions. Everything
--      else in the rule is as phase41 and phase45 left it: full access,
--      the fifteen sample questions, or a question already answered.
--   3. The pinned list itself. Running this again replaces the list
--      with the one below (the list only: no question, answer or
--      account is touched).
--
-- Safe to run more than once. Deletes nothing outside the new table.

-- 1. The table ------------------------------------------------------------------
create table if not exists public.free_diagnostic_items (
  position integer primary key,
  question_id bigint not null references public.generated_questions(id) on delete cascade,
  section_id bigint not null
);

alter table public.free_diagnostic_items enable row level security;

drop policy if exists "free_diagnostic_items: signed-in read" on public.free_diagnostic_items;
create policy "free_diagnostic_items: signed-in read"
  on public.free_diagnostic_items
  for select to authenticated
  using (true);

create or replace function public.free_diagnostic_question_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select question_id from public.free_diagnostic_items;
$$;

revoke all on function public.free_diagnostic_question_ids() from public;
grant execute on function public.free_diagnostic_question_ids() to authenticated;

-- 2. The read rule ------------------------------------------------------------
drop policy if exists "generated_questions: read what your access allows" on public.generated_questions;

create policy "generated_questions: read what your access allows"
  on public.generated_questions
  for select to authenticated
  using (
    status = 'approved'
    and (
      (select public.has_full_access())
      or id in (select public.sampler_question_ids())
      or id in (select public.free_diagnostic_question_ids())
      or exists (
        select 1 from public.user_answers a
        where a.question_id = generated_questions.id
          and a.user_id = (select auth.uid())
      )
    )
  );

-- 3. The pinned questions -------------------------------------------------------
begin;
delete from public.free_diagnostic_items;
insert into public.free_diagnostic_items (position, question_id, section_id) values
{{ROWS}};
commit;
