-- ============================================================
-- Phase 37 — shut the one table a stranger could read.
--
-- Found by scripts/audit-rls.mts, which holds the key that ships in
-- every page this site serves and tries to read all twenty-six tables
-- signed out. Twenty-five refused. billing_prices answered, because it
-- carried:
--
--   create policy "billing_prices: read" on public.billing_prices
--     for select using (true);
--
-- which is every reader on the internet, and the rows carry the Stripe
-- price ids along with the amounts. The amounts are on the pricing
-- page anyway; the ids are infrastructure, and neither needs to be
-- fetchable by a browser.
--
-- It was load-bearing: the signed-out pricing page read this table
-- with the browser's own key, so removing the policy first would have
-- emptied the prices on the public page. getBillingPrices now reads
-- with the service role instead, which is already deployed. Run this
-- after that is live and nothing changes; run it before and the
-- pricing page falls back to its built-in defaults until the deploy
-- catches up.
-- ============================================================

drop policy if exists "billing_prices: read" on public.billing_prices;

-- Admins keep full access through their own policy, which is unchanged.
-- Everything else reaches this table through the service role, which
-- row-level security does not apply to.

comment on table public.billing_prices is
  'Subscription prices, edited by an admin and read server-side with the service role. No anon or authenticated read: the pricing page is rendered on the server.';
