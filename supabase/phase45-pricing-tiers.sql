-- ============================================================
-- PINARD — Phase 45: four-tier pricing (pricing Phase 2)
-- Paste into the Supabase SQL editor and Run (once). Safe to run
-- again: every statement checks before it creates.
--
-- What it does, and why:
-- 1. subscriptions: the plan's billing period, region and price, so
--    a tier's Ask Pinard allowance can run over the period it was paid
--    for (pooled on the three-month plan), and so a card from a
--    different price region can be noticed at renewal.
-- 2. take_ask_daily(): the 60-a-day fair-use limit, counted safely
--    when several answers are asked at once.
-- 3. funnel_events: pricing-page and checkout events for the admin
--    conversion view. No identifiers beyond the account for signed-in
--    users, no cookies, nothing recorded when the browser asks not to
--    be tracked.
-- 4. signin_countries: which countries an account signs in from, by
--    day, for the account-sharing flags on the admin page. Flags only;
--    nothing is done automatically.
-- 5. sampler_question_ids(): the free sample becomes 15 questions in
--    total, spread across the syllabus, instead of 3 per section.
--
-- Nothing is deleted. Existing subscriptions keep working; their
-- old tier names are read as Basic until they next renew or change.
-- ============================================================

-- 1. Subscriptions ------------------------------------------------------------
alter table public.subscriptions
  add column if not exists plan_interval text,          -- 'month' or 'quarter'
  add column if not exists plan_region text,            -- 'standard', 'mid' or 'lower'
  add column if not exists stripe_price_id text,
  add column if not exists current_period_start timestamptz,
  -- A card from another price region, noticed after purchase: the
  -- region it implies, and when the customer was told. The new price
  -- applies from the first renewal at least 30 days later.
  add column if not exists pending_region text,
  add column if not exists region_notice_at timestamptz;

-- 2. The daily fair-use limit ------------------------------------------------
-- Same table as the period allowance, under a 'day:YYYY-MM-DD' key,
-- read and written under the row lock in one statement.
create or replace function public.take_ask_daily(
  p_user_id uuid,
  p_day text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
  v_key text := 'day:' || p_day;
begin
  insert into public.ask_usage (user_id, month, used)
    values (p_user_id, v_key, 0)
    on conflict (user_id, month) do nothing;

  select used into v_used
    from public.ask_usage
    where user_id = p_user_id and month = v_key
    for update;

  if v_used >= p_limit then
    return false;
  end if;

  update public.ask_usage
    set used = used + 1, updated_at = now()
    where user_id = p_user_id and month = v_key;
  return true;
end;
$$;

revoke all on function public.take_ask_daily(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.take_ask_daily(uuid, text, integer) to service_role;

-- 3. Funnel events ------------------------------------------------------------
create table if not exists public.funnel_events (
  id bigserial primary key,
  event text not null check (event in (
    'pricing_viewed', 'toggle_used', 'plan_chosen', 'checkout_started',
    'checkout_completed', 'limit_reached', 'upgrade_clicked'
  )),
  tier text,
  plan_interval text,
  region text,
  country text,            -- two letters, from the request; never stored with an IP address
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists funnel_events_created_idx on public.funnel_events (created_at desc);
alter table public.funnel_events enable row level security;
-- No policies: written and read by the server only.

-- 4. Sign-in countries --------------------------------------------------------
create table if not exists public.signin_countries (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  country text not null,
  sign_ins integer not null default 1,
  primary key (user_id, day, country)
);
alter table public.signin_countries enable row level security;
-- No policies: written and read by the server only.

create or replace function public.record_signin_country(p_user_id uuid, p_country text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.signin_countries (user_id, day, country)
    values (p_user_id, (now() at time zone 'utc')::date, upper(left(p_country, 2)))
    on conflict (user_id, day, country)
    do update set sign_ins = public.signin_countries.sign_ins + 1;
$$;
revoke all on function public.record_signin_country(uuid, text) from public, anon, authenticated;
grant execute on function public.record_signin_country(uuid, text) to service_role;

-- 5. The free sample: 15 questions in total ------------------------------------
-- One question from each active section in syllabus order, then a
-- second from each, until there are 15. SBAs only: an EMQ scenario
-- shown without its set is not a fair sample of an EMQ.
create or replace function public.sampler_question_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select id from (
    select q.id,
           row_number() over (partition by q.section_id order by q.id) as n,
           s.sort_order,
           s.id as section_id
    from public.generated_questions q
    join public.sections s on s.id = q.section_id
    where q.status = 'approved'
      and q.format = 'sba'
      and s.is_active
  ) ranked
  order by n, sort_order, section_id
  limit 15;
$$;

revoke all on function public.sampler_question_ids() from public;
grant execute on function public.sampler_question_ids() to authenticated;
