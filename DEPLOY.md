# Deploying Pinard to Vercel

A step-by-step for going from `C:\dev\pinard` to a live URL you can share
with pilot testers. Beginner-friendly.

---

## 1. Put the code on GitHub

Vercel deploys from a Git repository.

1. Create a free account at https://github.com and a **new, private**
   repository called `pinard` (don't add a README — the project already has
   files).
2. In a terminal:
   ```powershell
   cd C:\dev\pinard
   git remote add origin https://github.com/<your-username>/pinard.git
   git push -u origin main
   ```
   Your `.env.local` is git-ignored, so **no secrets are uploaded** — you'll
   set those in Vercel instead.

## 2. Import into Vercel

1. Sign up at https://vercel.com with your GitHub account.
2. **Add New → Project**, pick the `pinard` repo, and click **Import**.
3. Framework is auto-detected as **Next.js**. Leave the build settings
   default. **Don't deploy yet** — add the environment variables first
   (next step), or the first build will run without them.

## 3. Environment variables

In the Vercel project: **Settings → Environment Variables**. Add each of
these (copy the values from your local `.env.local`), for the **Production**
environment:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase — **secret** |
| `VOYAGE_API_KEY` | embeddings |
| `ANTHROPIC_API_KEY` | question generation |
| `STRIPE_SECRET_KEY` | test key for now (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | **from step 5 below** — leave blank for now |
| `STRIPE_PRICE_MONTHLY` / `_QUARTERLY` / `_ANNUAL` | your price IDs |
| `STRIPE_FOUNDING_COUPON` | `founding-member` |
| `BETA_FULL_ACCESS` | `true` for the pilot |
| `NEXT_PUBLIC_APP_URL` | your Vercel URL, e.g. `https://pinard.vercel.app` |

Then **Deploy**. You'll get a URL like `https://pinard-xxxx.vercel.app`.

## 4. Point Supabase auth at the live URL

Supabase → **Authentication → URL Configuration**:
- **Site URL:** your Vercel URL.
- **Redirect URLs:** add your Vercel URL (and keep `http://localhost:3000`
  for local dev).

Also make sure every SQL migration has been run on this Supabase project
(SQL Editor). In order: `schema.sql`, then `phase2-storage.sql`,
`phase2b-emq.sql`, `phase3-retrieval.sql`, `phase4-generation.sql`,
`phase5-diagnostic.sql`, `phase7-stripe.sql`, `phase8-admin-billing.sql`,
`single-session.sql`. (You've already run most; just run any you haven't.)

## 5. The Stripe webhook (now it's easy — no CLI)

Now that you have a public URL, the webhook is a dashboard step:

1. Stripe dashboard (**Test mode**) → **Developers → Webhooks → Add
   endpoint**.
2. **Endpoint URL:** `https://<your-vercel-url>/api/stripe/webhook`
3. **Events to send:** select `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`.
4. Create it, then **Reveal** the **Signing secret** (`whsec_…`).
5. Put it in Vercel as `STRIPE_WEBHOOK_SECRET`, and **redeploy** (Vercel →
   Deployments → ⋯ → Redeploy) so it takes effect.

Now a test purchase will flip the buyer's account to "active" automatically.

## 6. Production smoke test

On the live URL:
- [ ] Sign up a new (non-admin) test account, complete onboarding.
- [ ] Make your own account admin (Supabase SQL: `update public.profiles set
      role='admin' where id = (select id from auth.users where email='you@…')`),
      then confirm the **Admin** area loads.
- [ ] Admin → Billing: change a price, confirm `/pricing` updates; create a
      voucher code.
- [ ] With `BETA_FULL_ACCESS=false` temporarily: buy a plan with test card
      `4242 4242 4242 4242`, confirm `/account` shows **active** (webhook
      working), then **Manage billing** opens the portal. Set it back to
      `true` for the pilot.
- [ ] Admin → Users: your testers appear with their plan.

## Going live for real (later)

When you're ready to take real payments: swap the Stripe **test** keys for
**live** keys, re-run `node scripts/stripe-setup.mjs` against the live
account (it prints live price IDs), add a **live-mode** webhook endpoint,
and set `BETA_FULL_ACCESS=false`. Connect a custom domain in Vercel →
Settings → Domains.
