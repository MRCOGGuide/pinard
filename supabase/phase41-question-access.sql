-- Phase 41: what each account may read of the question bank.
--
-- Security audit finding H1 (docs/security/REPORT.md). The policy
-- "generated_questions: users read approved" let every signed-in
-- account, free ones included, read every approved question with its
-- answer and explanation straight from the Supabase API, using the key
-- every page ships. A free account could download the whole paid bank.
--
-- Now an account reads an approved question only when one of these is
-- true:
--   1. it has full access: an admin, an active subscriber, or an
--      invited pilot candidate while the pilot runs (the same rules as
--      getAccess in src/lib/access.ts);
--   2. the question is in the free sampler: the first three approved
--      questions of its section by id, exactly what buildSamplerSession
--      serves a free account;
--   3. the account has already answered it, so results and progress
--      pages that join answers to their questions keep working after a
--      subscription lapses.
--
-- recordAnswer and submitMockPaper read the question through the user's
-- own session, so they inherit the rule: a free account can no longer
-- learn the answer to a question it is not allowed to see.
--
-- BETA_FULL_ACCESS is an environment variable the database cannot read.
-- With it on, an account that is neither paying nor an invited pilot
-- sees the paid screens but only the sampler's questions. It should be
-- off at launch (report, M7).
--
-- Safe to run more than once.

-- 1. Full access, decided in the database --------------------------------
create or replace function public.has_full_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = auth.uid()
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null or s.current_period_end > now())
    )
    or (
      exists (select 1 from public.invite_redemptions r where r.user_id = auth.uid())
      -- The pilot window, as pilotPhase reads it: UK dates, an unset end
      -- means open-ended.
      and coalesce(
        (select trim(value) from public.app_settings where key = 'pilot_access_from'
           and trim(value) ~ '^\d{4}-\d{2}-\d{2}$'),
        '0000-01-01'
      ) <= to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD')
      and coalesce(
        (select trim(value) from public.app_settings where key = 'pilot_access_until'
           and trim(value) ~ '^\d{4}-\d{2}-\d{2}$'),
        '9999-12-31'
      ) >= to_char(now() at time zone 'Europe/London', 'YYYY-MM-DD')
    ),
    false
  );
$$;

-- 2. The free sampler: three per section, in id order ----------------------
create or replace function public.sampler_question_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from (
    select id, row_number() over (partition by section_id order by id) as n
    from public.generated_questions
    where status = 'approved'
  ) ranked
  where n <= 3;
$$;

revoke all on function public.has_full_access() from public;
revoke all on function public.sampler_question_ids() from public;
grant execute on function public.has_full_access() to authenticated;
grant execute on function public.sampler_question_ids() to authenticated;

-- Answers looked up by user and question together.
create index if not exists user_answers_user_question_idx
  on public.user_answers (user_id, question_id);

-- 3. The policy --------------------------------------------------------------
drop policy if exists "generated_questions: users read approved" on public.generated_questions;
drop policy if exists "generated_questions: read what your access allows" on public.generated_questions;

-- The function calls are wrapped in (select ...) so Postgres works them
-- out once per query rather than once per row.
create policy "generated_questions: read what your access allows"
  on public.generated_questions
  for select to authenticated
  using (
    status = 'approved'
    and (
      (select public.has_full_access())
      or id in (select public.sampler_question_ids())
      or exists (
        select 1 from public.user_answers a
        where a.question_id = generated_questions.id
          and a.user_id = (select auth.uid())
      )
    )
  );

-- The admin policy ("generated_questions: admin full access") is
-- unchanged.
