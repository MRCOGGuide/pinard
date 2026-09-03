-- ============================================================
-- PINARD — Phase 24: show a subscription that is ending
-- Paste into the Supabase SQL editor and Run (once).
-- ============================================================

-- Cancelling a subscription in Stripe does not end it: the customer
-- paid for a quarter and keeps access to the end of it, so the
-- subscription stays "active" with a date attached. Without that date
-- stored, the account page reads the period end as a renewal and tells
-- someone who has just cancelled that their subscription "renews" on
-- the very day it stops — the opposite of the truth, and indis-
-- tinguishable from a cancellation that silently failed.
alter table public.subscriptions
  add column if not exists cancel_at timestamptz;

comment on column public.subscriptions.cancel_at is
  'When a cancelled-but-still-running subscription ends. Null while it is renewing.';
