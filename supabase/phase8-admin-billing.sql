-- ============================================================
-- PINARD — Phase 8: admin-editable prices
-- Paste into the Supabase SQL editor and Run (once).
--
-- Display amounts + the active Stripe price id per tier. Prices are
-- edited from the admin Billing page (which creates a new Stripe price
-- and updates the row). Readable by everyone for the public /pricing
-- page; only admins can change them.
-- ============================================================

create table if not exists public.billing_prices (
  tier text primary key check (tier in ('monthly', 'quarterly', 'annual')),
  amount_pence int not null,
  cadence text not null default '',
  note text not null default '',
  stripe_price_id text,
  updated_at timestamptz not null default now()
);

insert into public.billing_prices (tier, amount_pence, cadence, note) values
  ('monthly', 1699, '/month', 'Flexible — cancel any time.'),
  ('quarterly', 3999, ' (£13.33/mo)', 'Matches a typical 10–14-week revision cycle.'),
  ('annual', 9999, '/year', 'For trainees spanning two sittings or parts.')
on conflict (tier) do nothing;

alter table public.billing_prices enable row level security;

create policy "billing_prices: read"
  on public.billing_prices for select
  using (true);

create policy "billing_prices: admin write"
  on public.billing_prices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
