-- ============================================================
-- PINARD — Phase 26: the Ask Pinard allowance
-- Paste into the Supabase SQL editor and Run (once).
--
-- Ask Pinard costs roughly 3p an answer to produce, so it is metered:
-- 100 questions each calendar month, included in every paid plan.
--
-- Two counters, because they behave differently. The monthly allowance
-- resets on the first of the month and does not carry over. A top-up is
-- bought once and lasts the whole subscription period — someone on a
-- quarterly plan who buys 100 extra questions in week two still has
-- them in week eleven — so it cannot live in a per-month row.
--
-- Both are written by the server only. A user who could write their own
-- counter would have no allowance at all.
-- ============================================================

-- ---------- the monthly allowance ----------
create table if not exists public.ask_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'YYYY-MM' in UTC, matching the month the answer was produced in.
  month text not null,
  used integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

comment on table public.ask_usage is
  'Ask Pinard questions asked per user per calendar month. Resets by virtue of a new row each month; old rows are kept as history.';

-- ---------- purchased top-ups ----------
create table if not exists public.ask_credits (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  granted integer not null,
  used integer not null default 0,
  purchased_at timestamptz not null default now(),
  -- End of the subscription period the top-up was bought in. Null while
  -- unknown; a null expiry is treated as still valid.
  expires_at timestamptz,
  -- One grant per payment, so a replayed webhook cannot grant twice.
  stripe_payment_ref text unique
);

comment on table public.ask_credits is
  'Ask Pinard top-ups: 100 extra questions, valid for the remainder of the subscription period rather than the calendar month.';

create index if not exists ask_credits_user_idx
  on public.ask_credits (user_id)
  where used < granted;

-- ---------- policies ----------
alter table public.ask_usage enable row level security;
alter table public.ask_credits enable row level security;

-- A candidate may read their own counters — the app shows them what is
-- left — and may write neither.
drop policy if exists "ask_usage read own" on public.ask_usage;
create policy "ask_usage read own" on public.ask_usage
  for select using (auth.uid() = user_id);

drop policy if exists "ask_credits read own" on public.ask_credits;
create policy "ask_credits read own" on public.ask_credits
  for select using (auth.uid() = user_id);

-- ---------- spending an answer ----------
-- Counting in the application would let two answers in flight at once
-- both read 99 and both write 100. This does the read and the write in
-- one statement, under the row lock, and reports what it spent.
--
-- Returns: 'monthly' when it came out of this month's allowance,
-- 'credit' when it came out of a top-up, 'none' when nothing was left.
create or replace function public.spend_ask_allowance(
  p_user_id uuid,
  p_month text,
  p_monthly_limit integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_credit_id bigint;
begin
  insert into public.ask_usage (user_id, month, used)
    values (p_user_id, p_month, 0)
    on conflict (user_id, month) do nothing;

  select used into v_used
    from public.ask_usage
    where user_id = p_user_id and month = p_month
    for update;

  if v_used < p_monthly_limit then
    update public.ask_usage
      set used = used + 1, updated_at = now()
      where user_id = p_user_id and month = p_month;
    return 'monthly';
  end if;

  -- Monthly allowance gone: take it from the oldest live top-up, so a
  -- credit that expires soonest is spent first.
  select id into v_credit_id
    from public.ask_credits
    where user_id = p_user_id
      and used < granted
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last, id
    limit 1
    for update skip locked;

  if v_credit_id is null then
    return 'none';
  end if;

  update public.ask_credits set used = used + 1 where id = v_credit_id;
  return 'credit';
end;
$$;

revoke all on function public.spend_ask_allowance(uuid, text, integer) from public;
grant execute on function public.spend_ask_allowance(uuid, text, integer) to service_role;
