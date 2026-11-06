-- Phase 54: scheduled calls from Supabase Cron.
--
-- Why. GitHub's schedule cannot be counted on: the hourly reminders ran 4 to
-- 10 hours apart, and the 5-minute background job ran twice in 17 hours
-- (6 November 2026). Supabase Cron runs inside the database, on time.
--
-- Before running this: add the secret in the dashboard, under Integrations >
-- Vault, with the name pinard_cron_secret and the same value as CRON_SECRET
-- in Vercel. This repository is public, so the value never goes in this file.
--
-- Each background call is made only when there is work waiting, so an idle
-- site costs Vercel nothing.
--
-- To stop everything:
--   select cron.unschedule('pinard-background-work');
--   select cron.unschedule('pinard-reminders');
--   select cron.unschedule('pinard-tidy-log');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Not in public, so the site's API can never reach it.
create schema if not exists scheduled;
revoke all on schema scheduled from public, anon, authenticated;

create or replace function scheduled.call_site(
  path text,
  method text default 'POST',
  wait_ms integer default 30000
)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  secret text;
  request_headers jsonb;
begin
  select trim(decrypted_secret) into secret
  from vault.decrypted_secrets
  where name = 'pinard_cron_secret';
  if secret is null or secret = '' then
    raise exception 'pinard_cron_secret is not in Vault';
  end if;

  request_headers := jsonb_build_object(
    'authorization', 'Bearer ' || secret,
    'content-type', 'application/json'
  );
  if method = 'GET' then
    return net.http_get(
      url := 'https://pinardapp.com/' || path,
      headers := request_headers,
      timeout_milliseconds := wait_ms
    );
  end if;
  return net.http_post(
    url := 'https://pinardapp.com/' || path,
    body := '{"continue":true}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := wait_ms
  );
end;
$$;

revoke all on function scheduled.call_site(text, text, integer) from public, anon, authenticated;

-- What background-work.yml did, with the same three calls, every 2 minutes.
create or replace function scheduled.background_work()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.generation_jobs where status in ('queued', 'running')) then
    perform scheduled.call_site('api/generate/worker?long=1');
  end if;
  if exists (select 1 from public.decision_aids where status = 'needs_changes') then
    perform scheduled.call_site('api/decision-aids/revise');
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'sources' and name like 'aids/searching/%') then
    perform scheduled.call_site('api/decision-aids/search');
  end if;
end;
$$;

revoke all on function scheduled.background_work() from public, anon, authenticated;

-- Scheduling under a name that exists replaces it, so this file can be run again.
select cron.schedule('pinard-background-work', '*/2 * * * *', 'select scheduled.background_work()');

-- What reminders.yml did. It sends mail, so it gets the time it can take.
select cron.schedule('pinard-reminders', '0 * * * *', $$select scheduled.call_site('api/reminders', 'GET', 290000)$$);

-- The run log would otherwise grow for ever.
select cron.schedule('pinard-tidy-log', '30 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- To check it is working, a few minutes later:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
--   select status_code, count(*) from net._http_response group by 1;
