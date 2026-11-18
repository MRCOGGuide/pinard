-- Phase 58: candidates may update only the profile columns they set themselves
-- (pre-launch review, 18 November 2026).
--
-- RUN THIS ONLY AFTER the code from branch launch-l1-security is live: that
-- code moves the three writes this blocks (the active device, the date the
-- diagnostic was finished, an admin changing a role) to the server.
--
-- Until now a signed-in candidate could update every column of their own
-- profile row through the public API, apart from the two guarded by
-- triggers (role, stripe_customer_id). That included active_session_id, so
-- a shared account could switch the one-device rule off, and any column
-- added later would have been writable by default. Now the table-wide
-- update right goes, and candidates get back only the columns the app
-- lets them change: name, exam and date, reminders, time zone, study hours.
-- The row-level policy still limits each candidate to their own row. The
-- server's service role is unaffected.
--
-- STEP 1, read only (before): "true" means signed-in accounts can write it now.
--
--   select
--     has_column_privilege('authenticated', 'public.profiles', 'active_session_id', 'UPDATE') as device,
--     has_column_privilege('authenticated', 'public.profiles', 'diagnostic_completed_at', 'UPDATE') as diagnostic,
--     has_column_privilege('authenticated', 'public.profiles', 'timezone', 'UPDATE') as timezone;
--
-- STEP 2, the change:

revoke update on public.profiles from anon, authenticated;
grant update (name, exam, exam_date, reminder_hour, reminders_enabled, timezone, study_hours_per_week)
  on public.profiles to authenticated;

-- STEP 3: run step 1 again. device and diagnostic should now read false,
-- timezone true. Then, signed in, change your reminder time on Account and
-- your exam date in onboarding: both should still save.
