-- Phase 43: security hardening, the Medium and Low findings of the audit
-- (docs/security/REPORT.md). Run after phase41 and phase42.
--
-- Safe to run more than once. The app is updated to match: every write
-- that loses a candidate policy here is now made by the server with the
-- service role, after the server has checked it.

-- M3. Extracted guideline facts are the library's, not the candidate's.
-- Any signed-in account could read every one. The app reads them on the
-- server (similar values, generation), so candidates need no access.
drop policy if exists "key_facts: users read" on public.key_facts;

-- M5. The Stripe customer on a profile is set by the server at checkout,
-- never by the candidate. A user who could write it could point their
-- profile at someone else's Stripe customer and open that person's
-- billing portal. Same pattern as protect_role_change: the service role
-- and the SQL editor (auth.uid() is null there) may change it, an admin
-- may, nobody else.
create or replace function public.protect_billing_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'The billing link is set by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_billing_link on public.profiles;
create trigger protect_billing_link
  before update on public.profiles
  for each row execute function public.protect_billing_link();

-- L1. A candidate could write their own answers (is_correct included),
-- topic scores, mock results, plans and Ask Pinard history straight from
-- the browser, falsifying their own progress or putting words in
-- Pinard's mouth. Reading their own rows is unchanged; writing is now
-- the server's job alone.
drop policy if exists "user_answers: insert own" on public.user_answers;
drop policy if exists "user_topic_performance: insert own" on public.user_topic_performance;
drop policy if exists "user_topic_performance: update own" on public.user_topic_performance;
drop policy if exists "mock_attempts: insert own" on public.mock_attempts;
drop policy if exists "mock_attempts: delete own" on public.mock_attempts;
drop policy if exists "study_plans: insert own" on public.study_plans;
drop policy if exists "chat_messages: insert own" on public.chat_messages;

-- M2. A ceiling on AI calls for the whole site per day, on top of each
-- candidate's monthly allowance, so no account, stolen or otherwise, can
-- run up an unbounded model bill. One row per UK day; the increment and
-- the check happen in one statement so two requests cannot both slip
-- under the limit.
create table if not exists public.ai_daily_usage (
  day date primary key,
  calls integer not null default 0
);
alter table public.ai_daily_usage enable row level security;
comment on table public.ai_daily_usage is
  'AI calls per UK day across the site, for the daily ceiling. Service role only.';

create or replace function public.take_ai_call(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Europe/London')::date;
  v_calls integer;
begin
  insert into public.ai_daily_usage as u (day, calls)
    values (v_day, 1)
    on conflict (day) do update set calls = u.calls + 1
    returning calls into v_calls;
  if v_calls > p_limit then
    -- Over: give the call back so the count stays the number served.
    update public.ai_daily_usage set calls = calls - 1 where day = v_day;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.take_ai_call(integer) from public;
grant execute on function public.take_ai_call(integer) to service_role;
