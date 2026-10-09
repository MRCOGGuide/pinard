-- ============================================================
-- PINARD — Phase 44: data retention (Phase 11, legal)
-- Paste into the Supabase SQL editor and Run (once), ONLY after the
-- owner has approved it: running this file is the approval, because
-- from then on the hourly reminder job deletes old rows (see below).
--
-- The privacy policy promises these limits. Until this runs they are
-- not enforced, and the policy says more than the system does.
--
--   What                                        Kept for
--   ------------------------------------------  -----------
--   Ask Pinard failures and challenges in the   12 months
--   failures log (the candidate's question
--   text, no name; security audit L6)
--   Access-code and waitlist rate-limit rows    30 days
--   (a hashed IP address)
--   Waitlist entries                            12 months
--
-- Nothing else is touched: accounts, answers, payments and the
-- generator's own failure rows (no personal data) are left alone.
-- ============================================================

create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  failures int;
  attempts int;
  waiting int;
begin
  -- Rows written by the two Ask boxes (src/app/actions.ts and
  -- src/app/session/actions.ts), told apart by the reason they carry.
  delete from public.generation_failures
   where created_at < now() - interval '12 months'
     and (reason like '%(ask box)'
          or reason like 'chat challenge on question %'
          or reason ~ '\(question [0-9]+\)$');
  get diagnostics failures = row_count;

  delete from public.gate_attempts
   where greatest(first_failed_at, coalesce(locked_until, first_failed_at)) < now() - interval '30 days';
  get diagnostics attempts = row_count;

  delete from public.waitlist
   where created_at < now() - interval '12 months';
  get diagnostics waiting = row_count;

  return jsonb_build_object('failures', failures, 'gate_attempts', attempts, 'waitlist', waiting);
end;
$$;

comment on function public.purge_expired_data() is
  'Deletes rows past the retention periods in the privacy policy. Called by the hourly reminder job (src/app/api/reminders/route.ts).';

-- The service role only: nobody signed in, or signed out, can call it.
revoke all on function public.purge_expired_data() from public, anon, authenticated;
grant execute on function public.purge_expired_data() to service_role;
