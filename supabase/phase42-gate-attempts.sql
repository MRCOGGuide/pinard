-- Phase 42: a limit on guessing the pre-launch access code.
--
-- Security audit finding H4 (docs/security/REPORT.md): /api/gate took
-- unlimited attempts, so a script could try codes until one worked.
-- Each failed attempt is now counted against the visitor; ten in fifteen
-- minutes locks them out for fifteen minutes (src/app/api/gate/route.ts).
--
-- The visitor is recorded as a keyed hash of their IP address, never the
-- address itself, so this table holds no personal data in readable form.
-- Rows are working state: a successful code clears the row, and rows
-- older than a day mean nothing and can be deleted at any time.
--
-- Read and written only by the server with the service role: RLS is on
-- and there are no policies, so the browser key can do nothing here.
--
-- Safe to run more than once.

create table if not exists public.gate_attempts (
  visitor text primary key,          -- HMAC of the IP address
  failures integer not null default 0,
  first_failed_at timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.gate_attempts enable row level security;

comment on table public.gate_attempts is
  'Failed access-code attempts per visitor (keyed hash of the IP), for the gate''s lockout. Service role only.';
