-- Phase 53: the gaps log (owner's brief, part 7: "If the sources do not
-- cover something, the assistant says so plainly and does not fill the
-- gap from general knowledge. Log each gap for the owner.")
--
-- Each time Ask Pinard says something is not covered, what it said is kept
-- here for Admin > Ask gaps. A row holds what was not covered and which box
-- it came from: never a name or an account. The one case that holds a
-- candidate's words is a question refused outright, where the question is
-- the only record of what was missing, so rows go after 12 months, as the
-- privacy policy promises for failed answers. Running this file is the
-- approval for that: until then the hourly job's call simply fails.
--
-- Admins only. Adds one table and one function; changes and deletes
-- nothing else. Safe to run more than once.

create table if not exists public.ask_gaps (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  gap text not null,
  origin text not null default 'ask' check (origin in ('ask', 'bench', 'follow_up')),
  status text not null default 'open' check (status in ('open', 'added', 'not_a_gap'))
);

create index if not exists ask_gaps_created_idx on public.ask_gaps (created_at desc);

alter table public.ask_gaps enable row level security;

drop policy if exists "ask_gaps: admin full access" on public.ask_gaps;
create policy "ask_gaps: admin full access"
  on public.ask_gaps
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.purge_ask_gaps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  gone int;
begin
  delete from public.ask_gaps where created_at < now() - interval '12 months';
  get diagnostics gone = row_count;
  return gone;
end;
$$;

comment on function public.purge_ask_gaps() is
  'Deletes gaps past the 12 months in the privacy policy. Called by the hourly reminder job (src/app/api/reminders/route.ts).';

-- The service role only: nobody signed in, or signed out, can call it.
revoke all on function public.purge_ask_gaps() from public, anon, authenticated;
grant execute on function public.purge_ask_gaps() to service_role;
