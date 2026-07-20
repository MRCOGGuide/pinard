-- ============================================================
-- PINARD — Phase 7: Stripe billing columns
-- Paste into the Supabase SQL editor and Run (once).
-- Webhooks write subscriptions via the service role; users only read.
-- ============================================================

alter table public.profiles
  add column if not exists stripe_customer_id text;
create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);

alter table public.subscriptions
  add column if not exists stripe_subscription_id text,
  add column if not exists founding_member boolean not null default false,
  add column if not exists updated_at timestamptz;
