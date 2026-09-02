-- ============================================================
-- PINARD — Phase 22: daily reminders and milestones
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- When a candidate wants their nudge, and whether they want it at all.
-- 07:00 by default: before a day shift, and the plan is written for
-- people revising around clinical work.
alter table public.profiles
  add column if not exists reminder_hour int not null default 7,
  add column if not exists reminders_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_reminder_hour_range'
  ) then
    alter table public.profiles
      add constraint profiles_reminder_hour_range
      check (reminder_hour between 0 and 23);
  end if;
end $$;

-- The day a notification was sent, in the candidate's own timezone
-- (this audience is UK), so "already sent today" is a plain equality
-- test rather than a window over timestamps.
alter table public.notifications_log
  add column if not exists sent_on date not null
    default ((now() at time zone 'Europe/London')::date);

-- One notification of a given type per person per day. The daily
-- reminder can then be attempted freely — a retried cron, a manual run,
-- two overlapping invocations — without anyone being emailed twice.
create unique index if not exists notifications_log_once_per_day
  on public.notifications_log (user_id, type, sent_on);

-- Users manage their own reminder settings through their profile row,
-- which existing policy already covers. Writes to notifications_log stay
-- service-role only.
