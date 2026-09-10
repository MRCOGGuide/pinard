-- ============================================================
-- PINARD — Phase 30: settings the owner can change without a deploy
-- Paste into the Supabase SQL editor and Run (once).
--
-- Phase 18 made Similar Values facts usable until declined, so the
-- panel would keep working while the bank was reviewed. That is the
-- wrong default when the review has not started: candidates see
-- figures nobody has judged yet, and the only way to stop it is to
-- decline them one group at a time.
--
-- What was missing is a switch. Not an environment variable — that
-- needs a deploy, which is not a button — so it lives here, where the
-- owner can turn a candidate-facing feature off, review at their own
-- pace, and turn it back on.
--
-- Deliberately a table of settings rather than one boolean column.
-- The next thing the owner wants held back will want the same switch,
-- and a second single-purpose column is how a schema becomes a drawer.
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Owner-controlled switches for candidate-facing features. Read server-side with the service role; never written by a candidate.';
comment on column public.app_settings.value is
  'Stored as text so a setting can grow past true/false without a migration. Booleans are the string "true" or "false".';

-- Off to begin with: the point of the switch is that the panel waits
-- for the review rather than the review chasing the panel.
insert into public.app_settings (key, value)
values ('similar_values_enabled', 'false')
on conflict (key) do nothing;

-- No policies, so nothing reaches this table through the anon or
-- authenticated keys. Every read and write goes through the service
-- role, which RLS does not apply to. A candidate never queries it —
-- the server decides what to send them.
alter table public.app_settings enable row level security;
