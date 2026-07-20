# Pinard — first-time setup (beginner walkthrough)

Follow these steps once, in order. Afterwards you just run `npm run dev`.

---

## 1. Create the Supabase project

1. Go to **https://supabase.com** and click **Start your project**. Sign up
   (GitHub or email — either is fine).
2. Click **New project**.
   - **Name:** `pinard`
   - **Database password:** click **Generate a password** and save it
     somewhere safe (a password manager). You rarely need it, but keep it.
   - **Region:** choose **West EU (London)** — closest to your users.
3. Click **Create new project** and wait a minute or two while it provisions.

## 2. Get your keys and paste them into `.env.local`

1. In the Supabase dashboard, open **Project settings** (gear icon, bottom
   left) → **API keys** (under "Configuration"). If your dashboard shows a
   **Data API** page instead, the same values live there.
2. You need three values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon / public key** — a long string starting `eyJ…` (or `sb_publishable_…` on newer projects)
   - **service_role / secret key** — another long string. **This one is
     secret**: it bypasses all security rules. Never share it, never put it
     anywhere except `.env.local`.
3. Open the file `pinard/.env.local` in any text editor and replace the
   placeholders:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your anon key...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...your service role key...
   ```

   No quotes, no spaces around the `=`. Save the file. `.env.local` is
   git-ignored, so the keys never end up in your repository.

## 3. Create the database (tables, pgvector, security rules)

1. In the Supabase dashboard, open the **SQL Editor** (left sidebar).
2. Open the file `pinard/supabase/schema.sql` on your computer, select
   **everything** (Ctrl+A), copy it.
3. Paste it into the SQL editor and click **Run** (or Ctrl+Enter).
4. You should see **"Success. No rows returned"**. That one run:
   - enabled the **pgvector** extension (for AI embeddings later),
   - created all 13 tables from PROJECT.md section 6,
   - turned on row-level security everywhere with the right policies,
   - set up the trigger that creates a `profiles` row for every new user.
5. Check it worked: open **Table Editor** in the sidebar — you should see
   `profiles`, `sections`, `content_documents`, and the rest.

> If the editor complains that something "already exists", the script was
> already run — that's fine, nothing to fix.

## 4. Configure email/password auth

1. In the dashboard go to **Authentication → Sign In / Providers**.
2. **Email** is enabled by default — that's our email/password sign-in.
3. While you're developing, turn **off** "Confirm email" (same page) so you
   can sign in immediately after signing up without clicking email links.
   Turn it back **on** before real users arrive.

## 5. Run the app

Open a terminal (PowerShell) and run:

```powershell
cd "C:\Users\Emmanuel\OneDrive\MRCOG Guide\Claude Road Map\pinard"
npm run dev
```

Then open **http://localhost:3000** in your browser. Stop the server with
Ctrl+C. (If `npm` isn't recognised, close and reopen the terminal — Node was
added to your PATH and new terminals pick it up.)

## 6. Create your account and make it admin

1. On the site, click **Sign in → Create an account** and register with your
   own email and a password.
2. Back in the Supabase dashboard, open the **SQL Editor** and run:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

   (Replace `you@example.com` with the email you registered.)
3. Refresh http://localhost:3000 — an **Admin** link now appears in the
   navigation, and `/admin` opens for you. Everyone else who signs up is a
   normal `user` and gets redirected away from `/admin`.

---

### Where things live

| What | Where |
|---|---|
| Colour tokens & fonts | `tailwind.config.ts`, `src/app/layout.tsx` |
| The trace underline | `src/components/Trace.tsx` + `.trace-path` in `src/app/globals.css` |
| Logo | `src/components/Logo.tsx` (inline) and `public/pinard-logo.svg` |
| Header / footer / shell | `src/components/SiteHeader.tsx`, `SiteFooter.tsx`, `src/app/layout.tsx` |
| Auth screens | `src/app/sign-in/`, `src/app/sign-up/`, `src/app/auth/sign-out/` |
| Supabase clients | `src/lib/supabase/` (+ `src/middleware.ts` session refresh) |
| Database schema | `supabase/schema.sql` |
| Secrets | `.env.local` (never committed) |

### Phase 3 — ingestion keys (once)

1. **Voyage AI** (embeddings): sign up at https://dashboard.voyageai.com,
   create an API key, paste it into `.env.local` as `VOYAGE_API_KEY`.
2. **Anthropic** (key facts + question generation): sign up at
   https://console.anthropic.com, add billing, create an API key, paste it
   into `.env.local` as `ANTHROPIC_API_KEY`.
3. Run `supabase/phase3-retrieval.sql` in the Supabase SQL Editor (adds the
   `match_chunks` vector-search function and ingestion stats).
4. Restart the dev server (Ctrl+C, `npm run dev`) so it picks up the keys.

Documents ingest automatically on upload; use **Re-ingest** on a document
card to reprocess anything uploaded before the keys were set.

### Phase 7 — Stripe payments (test mode)

Nobody is charged real money in test mode. Steps:

1. Create a free account at https://stripe.com. Stay in **Test mode**
   (toggle, top right of the dashboard).
2. **Secret key:** Developers → API keys → copy the **Secret key**
   (starts `sk_test_`). Paste into `.env.local` as `STRIPE_SECRET_KEY`.
3. **Create the prices + coupon automatically:** in a terminal,
   `cd C:\dev\pinard` then `node scripts/stripe-setup.mjs`. It creates the
   Monthly/Quarterly/Annual prices and the founding-member coupon in your
   Stripe account and prints four lines — paste them into `.env.local`
   (`STRIPE_PRICE_MONTHLY`, `_QUARTERLY`, `_ANNUAL`, `STRIPE_FOUNDING_COUPON`).
4. **Run the SQL:** run `supabase/phase7-stripe.sql` in the Supabase SQL
   Editor (adds the billing columns).
5. **Webhook (local testing):** install the Stripe CLI
   (https://stripe.com/docs/stripe-cli), run `stripe login`, then in its own
   terminal: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
   It prints a signing secret (`whsec_...`) — paste it into `.env.local` as
   `STRIPE_WEBHOOK_SECRET`. Keep this terminal running while you test.
6. **Pilot vs paywall:** `BETA_FULL_ACCESS=true` gives everyone full access
   (your pilot). To test the checkout flow, set it to `false`, restart, then
   on `/pricing` choose a plan and pay with test card `4242 4242 4242 4242`,
   any future expiry, any CVC. After paying you land on `/account` with an
   active subscription; **Manage billing** opens the Stripe customer portal
   to cancel.

Restart the dev server after editing `.env.local`.

### Important: the app now lives at `C:\dev\pinard`

The app was **moved out of OneDrive** to `C:\dev\pinard`. OneDrive kept
trying to sync Next.js's constantly-rewritten build folder (`.next`) and
locking it, which made every page fail with a 500 error. Moving the app to
a normal (non-synced) folder fixes that permanently.

- **To run it:** open PowerShell and run
  `cd C:\dev\pinard` then `npm run dev`, and open http://localhost:3000.
- Your brief and source docs (PROJECT.md, AI-PROMPTS.md, BUILD-PHASES.md,
  the logo) stay in the OneDrive "Claude Road Map" folder — they're small,
  static, and worth keeping backed up.
- Do **not** move the app back into OneDrive; the 500s would return.
- Git, your `.env.local` keys, and `node_modules` all moved with the app,
  so nothing needs reinstalling.
