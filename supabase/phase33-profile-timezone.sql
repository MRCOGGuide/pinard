-- Phase 33 — where each candidate actually is.
--
-- Reminders have always gone out on Europe/London time, for everyone.
-- More people sit this exam outside the UK than in it, so "your 7am
-- reminder" has been arriving at 11am in Karachi and 2am in Lagos.
--
-- An IANA zone name ("Europe/London", "Asia/Karachi"), captured from
-- the browser. Null means we have not been told yet, and the sender
-- falls back to Europe/London — the behaviour everyone has today, so
-- running this migration changes nothing until a candidate's browser
-- reports their zone.
--
-- Run in the Supabase SQL editor, then redeploy.

alter table profiles
  add column if not exists timezone text;

comment on column profiles.timezone is
  'IANA timezone of the candidate, captured from the browser. Null falls back to Europe/London.';

-- The reminder cron reads every enabled profile each run and now needs
-- the zone with them; this keeps that read on an index rather than a
-- scan as the table grows.
create index if not exists profiles_reminders_enabled_idx
  on profiles (reminders_enabled)
  where reminders_enabled = true;
