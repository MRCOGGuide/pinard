# Going live with the new plans: your checklist

Pricing Phase 2, 10 October 2026. Everything here happens in Stripe **live mode**, on Supabase or on Vercel, which only you can do. Work through it in order, after the branch `feat/pricing-tiers` is merged and deployed. Nothing below was done for you.

## Before anything else

- [ ] **Supabase:** run `supabase/phase45-pricing-tiers.sql` in the SQL editor if you have not already. It deletes nothing.
- [ ] **Vercel:** move to the **Pro** plan. The Hobby plan is for non-commercial use only.

## Stripe, live mode

Make sure the toggle at the top of the Stripe Dashboard says **Live**, not Test mode.

- [ ] **Managed Payments (merchant of record).** Stripe Dashboard > Settings > search "Managed Payments". Apply or switch it on. Stripe reviews eligibility; Pinard should qualify as an Irish business selling a fully automated online course. If Stripe says no, tell me, and we move to Paddle.
- [ ] **Create the plans and prices.** In a terminal in the project folder:
  1. Copy your live secret key (Stripe > Developers > API keys > Secret key). Paste it into this terminal only, never into a file:
     - Windows PowerShell: `$env:STRIPE_LIVE_SECRET_KEY="sk_live_..."`
     - Git Bash: `export STRIPE_LIVE_SECRET_KEY=sk_live_...`
  2. Run `node scripts/stripe-tiers-setup.mjs --live`.
  3. Close the terminal afterwards.

  It creates:
  - one product per tier;
  - the 18 prices (three tiers, two billing periods, three regions, tax added on top);
  - the two top-up packs;
  - one billing portal per region.
- [ ] **Webhook events.** Developers > Webhooks > your pinardapp.com endpoint > Update details. Add three events to the four already there:
  - `invoice.paid` (the card-country safety net);
  - `invoice.upcoming` (applies a region change once 30 days' notice has passed);
  - `payment_method.attached` (checks a changed card).
- [ ] **Upcoming-invoice timing.** Settings > Billing > Subscriptions and emails: set the upcoming invoice event to **7 days** before renewal. While there, turn on **Send emails about upcoming renewals**.
- [ ] **Tax display for EU visitors.** Settings > Tax > Registrations > Add registration: Ireland, **One-Stop Shop (Union scheme)**.
  - This is only used to show EU visitors prices with VAT included on Pinard's pricing page. Stripe, as merchant of record, charges and pays the actual tax either way.
  - Ask your accountant whether to add it. Without it, every visitor sees the net price and "plus any local tax, shown at checkout".
- [ ] **Founding offer.** In Pinard, go to Admin > Billing > Founding offer and press Save once. That makes the live coupon, limited to Basic and Plus and at most 30%.
- [ ] **Apple Pay and Google Pay.** Settings > Payment methods: make sure both are on. They appear on Stripe's checkout page by themselves on devices that support them.
- [ ] **Old prices.** Leave the old Monthly, Quarterly and Annual prices active while anyone is subscribed on them. Those subscribers count as Basic until they renew or change plan. Archive the old prices once nobody uses them.

## A real purchase, then a refund

- [ ] Buy Basic monthly with your own card on the live site.
- [ ] Check that Account shows Basic, with "0 of 30 used this month".
- [ ] Ask one question in Ask Pinard; the meter should move to 1 of 30.
- [ ] Use **Withdraw from contract here** on the Account page; the refund should arrive.
- [ ] Look at Admin > Conversion: the steps of your purchase should appear.

## Decisions still open

- [ ] **Countries where Stripe does not take on the tax:** UAE, Bahrain, Oman, Jordan, Pakistan, Bangladesh and Sri Lanka. Ask your accountant. To stop selling in any of them, add its two-letter code to `SALES_BLOCKED_COUNTRIES` in `src/config/pricing.ts`.
- [ ] **Accountant:** whether your sale to Stripe carries Irish VAT. It depends on which Stripe company buys from you.
- [ ] **Solicitor:** the new clauses marked "For legal review":
  - prices set by the country of the card;
  - refunding a purchase made at another country's price;
  - Link as the seller;
  - whether the `pinard_price_check` cookie counts as strictly necessary.
