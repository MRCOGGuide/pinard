# Pinard security audit (Phase 10)

**Date:** 9 October 2026. **Branch:** `phase-10-security`.

**Status:** report only. Nothing has been fixed yet; Critical and High items are fixed after the owner approves.

## Method

- **Code read:** every API route, every server action, the middleware, all 27 database tables and their row-level-security (RLS) rules, the storage bucket rules, the Stripe webhook and checkout, and the AI endpoints.
- **Secrets scan:** every commit in git history (354 of them), plus the current files.
- **Dependency audit:** `npm audit`, compared against the Next.js security advisories.
- **42Crunch-equivalent API review.** The owner has no 42Crunch account, so its method was applied by hand:
  1. An OpenAPI 3.0 description of every HTTP route was written from the code ([openapi.json](openapi.json)).
  2. It was audited against the OWASP API Security Top 10 checks that 42Crunch's audit uses: authentication, authorisation by object and by function, input constraints, error shapes and methods.
  3. A live conformance scan was run against localhost, signed out (18 probes, all as expected; see below).
  4. The authorisation ("can user A reach user B?") tests were done by reading every action for an ID that crosses users.
- **Not done live:** RLS tests as user A against user B. The local app uses the production database, and the brief says never test against production. See "Decisions needed".

## Findings

Ranked Critical, High, Medium, Low. Each has a one-line "what could actually happen".

### Critical

None found.

### High

**H1. Free accounts can read the whole paid question bank.**
- **What could happen:** anyone with a free account downloads every approved question with its answer and explanation (about 2,000) in a few minutes. They need only the public Supabase key from any page and their own login.
- **Cause:** the RLS rule `generated_questions: users read approved` lets any signed-in user read every approved question.
- **Also:** `recordAnswer` and `submitMockPaper` check sign-in but not payment, so they work as an answer oracle for any question ID.
- **Fix:** a database rule that limits free users to the free-sample questions (the `free_sample` column already exists), plus a paid-access check in both actions. This is a schema change, which needs the owner's approval.

**H2. Next.js 14.2.35 has 23 published security advisories.**
- **What could happen:** crafted requests can slow or take down the site (several denial-of-service issues in Server Actions and Server Components, which the app uses throughout), and some responses can be cache-poisoned.
- **Fix available:** only in Next.js 15.5.24 or later. There is no 14.x patch.
- **Not reachable on this deployment:** the two critical advisories, which concern the image optimiser and Windows-hosted servers. The app has no `next/image`, and on Vercel image requests go to Vercel's own service.
- **Fix:** upgrade to Next.js 15.5 with React 19. That is a major upgrade (`cookies()` and `headers()` become async, among other changes) and needs its own testing pass.

**H3. No security headers.**
- **What could happen:**
  - The site can be framed by another site, and a signed-in candidate can be tricked into clicking "Clear my mock scores" or "Delete account" (clickjacking).
  - There is no second line of defence if a script were ever injected.
  - Browsers are not told to always use HTTPS.
- **Fix:** set the following headers in `next.config.mjs`:
  - Content-Security-Policy, limited to the site, Supabase and Stripe, and started in report-only mode;
  - `frame-ancestors 'none'` and `X-Frame-Options: DENY`;
  - Strict-Transport-Security;
  - Referrer-Policy;
  - Permissions-Policy;
  - `X-Content-Type-Options: nosniff`.

**H4. The access-code gate has no limit on attempts.**
- **What could happen:** a script can try codes as fast as the server answers until it finds the pre-launch code.
- **Fix:** count failed attempts per IP address in a small table (a schema change) and lock out for 15 minutes after 10 failures. Also take M1 below.

### Medium

**M1. The gate cookie is the access code itself.**
- **What could happen:** anyone who sees the cookie (on a shared computer, in a screenshot of developer tools) learns the code.
- **Detail:** the cookie is `btoa(code)`, which is only encoded, not hidden. It also lacks the `Secure` flag, and it is checked with a plain comparison.
- **Fix:** store an HMAC of the code (with a separate secret) instead, set `Secure`, and use a constant-time comparison.

**M2. AI spend has no overall cap.**
- **What could happen:** one subscriber, or a stolen account, runs up a large Amazon Bedrock bill.
- **Cause:**
  - Ask Pinard under a question is limited per question but does not count against the 100-a-month allowance, so it can be repeated across thousands of questions.
  - There is no site-wide daily cap.
  - If the database function `spend_ask_allowance` were missing, metering switches itself off rather than refusing.
- **Fix:** count both Ask boxes against one allowance, add a daily site-wide ceiling, and refuse when metering is unavailable.

**M3. Every signed-in user can read all extracted guideline facts.**
- **What could happen:** a free user copies the paid library's key facts.
- **Cause:** the rule `key_facts: users read` is `using (true)`.
- **Fix:** admin and service role only. The app reads key facts on the server anyway.

**M4. Stripe events arriving out of order can re-open a cancelled subscription.**
- **What could happen:** a late "subscription updated" event, processed after "subscription deleted", sets the status back to active. A cancelled user keeps access.
- **Fix:** fetch the subscription's current state from Stripe before writing.

**M5. A user can edit the Stripe customer ID on their own profile.**
- **What could happen:** a user who learns another customer's ID could open that person's billing portal. The IDs are long and random, so this is unlikely but real. The webhook also falls back to this column to find a user.
- **Fix:** a column-level rule or trigger so only the server can set it.

**M6. Raw database errors are shown to candidates.**
- **What could happen:** about ten candidate actions pass database error text, such as table names and rule names, straight to the screen. That helps an attacker map the database.
- **Fix:** log the detail, and show a plain message instead.

**M7. Sign-up may be open at the API level, and `BETA_FULL_ACCESS` may be on.**
- **What could happen:**
  - The invite code is checked only in the browser before `supabase.auth.signUp` is called. If Supabase's "Allow new users to sign up" is on, anyone can create an account directly through the Supabase API without a code.
  - If `BETA_FULL_ACCESS=true` is set in production (it is the default in `.env.example`), every account gets the whole paid product.
- **Fix:** the owner checks both settings (see below). Long-term, create pilot accounts on the server after the code is verified.

### Low

- **L1. Users can write some of their own rows.** They can write their own `user_answers`, `user_topic_performance`, `mock_attempts`, `study_plans` and `chat_messages` rows directly, and Ask Pinard on Today accepts client-supplied history. **What could happen:** a user can falsify only their own progress, or steer their own answers.
- **L2. Missing guards and weak randomness.**
  - `lib/supabase/admin.ts` has no `server-only` guard. The key cannot reach the browser today (it has no public prefix), but the guard stops a future mistake.
  - The cron secret is compared with `===`.
  - Invite codes use `Math.random`. At 32^8 combinations they cannot be guessed, but `crypto.randomInt` is the right tool.
- **L3. The waitlist is open to abuse.** It has no rate limit and no length cap, and anyone who knows an email address can overwrite that person's entry. **What could happen:** spam or mischief in the waitlist.
- **L4. The Stripe webhook returns the Stripe library's error text** on a bad signature. This is harmless, and it is Stripe's own message.
- **L5. Development tools carry advisories.** Seven high advisories are in build-time tooling only (eslint-config-next, Tailwind 3's glob tooling). None is shipped to users. They clear with the Next.js upgrade and Tailwind 4.
- **L6. Ask Pinard questions are kept in an internal table.** Some candidate questions are stored in `generation_failures` for review. These may contain anything a candidate types, so retention belongs in the Phase 11 privacy work.
- **L7. Session cookies are not marked `Secure`.** They use the Supabase defaults. **What could happen:** low exposure, because Vercel redirects HTTP to HTTPS. HSTS from H3 closes the rest.

## Checked and sound

- **Secrets:** no secrets in the code or in any of the 354 commits. No secret uses a `NEXT_PUBLIC_` name, `.env*.local` is ignored by git, and `.env.example` holds placeholders only.
- **The service-role key** is used only in server code, and never in a client component.
- **RLS** is on for all 27 tables, and the `sources` storage bucket is admin-only.
- **Admin role:** a database trigger stops users promoting themselves to admin.
- **Paid access** is decided on the server from data users cannot edit: role, subscriptions and invite redemptions.
- **Admin checks:** every admin action and admin API route checks for an admin (`requireAdmin`, or the role check).
- **Cron routes:** the generation worker and reminders require the cron secret or an admin.
- **Stripe webhook:**
  - the signature is verified before anything is read;
  - subscription writes are upserts, safe to repeat;
  - top-up credits are unique per payment, so they cannot be granted twice;
  - access is granted only by the server, never by the browser.
- **Checkout:** the plan is validated against the three real plans, prices come from the server, and return addresses come from configuration, not from the request.
- **Redirects:** `?next=` after sign-in accepts only paths on this site, so there is no open redirect.
- **CSRF:**
  - Next.js checks the origin on every server action.
  - The API's POST routes rely on `SameSite=Lax` cookies, which browsers do not send on cross-site form posts.
  - Sign-out without a session does nothing.
- **Gate coverage:** the middleware gate covers every page except three machine endpoints, and Next.js 14.2.35 includes the fix for the middleware bypass (CVE-2025-29927).
- **AI endpoints:**
  - sign-in, paid access and a 2,000-character message limit are checked;
  - answers draw only on the guidance library, never on other users' data, so nothing can leak between users;
  - output is rendered as text, never as raw HTML (the one `dangerouslySetInnerHTML` is the fixed theme script).
- **Answers** are marked on the server; the browser is never trusted with what is correct.
- **One user cannot reach another's data:** every non-admin action limits itself to the signed-in user's own rows, and question IDs are looked up through the user's own access rules.
- **Logs** contain timings and error text, with no personal data and no keys.

## Live API scan (signed out, localhost)

All 18 probes behaved correctly:

| Probe | Result |
|---|---|
| Webhook with no signature, or a forged one | 400 |
| Cron routes with no secret, or a wrong one | 401 |
| Admin routes, including path-traversal and oversized inputs | 401 |
| Portal and top-up | redirect to sign-in |
| Checkout with an invalid plan | `/pricing?error=tier` |
| Checkout with a valid plan | sign-in with the plan carried through |
| Wrong HTTP methods | 405 |
| A 200 KB gate post | handled |

The scan script is `scripts/_scan.mjs`, kept local only.

## Decisions needed from the owner

1. **Approve the fixes for H1 to H4.** H1 and H4 add database rules or a small table, which is a schema change. H2 is a major framework upgrade, done on its own branch with a full re-test.
2. **Live RLS tests.** These are the visitor test, and user A against user B. Choose one:
   - **(a)** Allow the existing read-mostly signed-out probe (`scripts/audit-rls.mts`) to run against production. Its write attempts are built to fail.
   - **(b)** Create a Supabase test branch or test project. This is a Supabase settings change and may cost money.
   - **(c)** Run Supabase locally in Docker. This is a large download and costs nothing.
3. **Check two Supabase settings in the dashboard:**
   - Authentication > Sign In / Providers: is "Allow new users to sign up" on?
   - Authentication > URL Configuration: which redirect URLs are allowed? There should be only the production domain and localhost.
4. **Check two Vercel settings:** `BETA_FULL_ACCESS` (it should be absent or `false` at launch) and `SITE_GATE_PASSWORD` (set).
5. **RevenueCat:** no webhook exists yet, because the mobile apps are not built. When they are, it must verify RevenueCat's authorisation header and be idempotent, like the Stripe one.

## Automation recommendations (claude-code-setup)

These are recommendations only. Nothing is installed until the owner agrees.

- **Hooks** (in `.claude/settings.json`):
  - **Block edits to `.env*` files.** PreToolUse on Edit and Write, so keys are never rewritten by accident.
  - **Scan for secrets before each commit.** PreToolUse on `git commit` runs the same key patterns used in this audit over the staged diff, and blocks the commit if one matches.
  - **Type-check on stop.** When a turn ends after edits, run `tsc --noEmit` and lint.
  - **Block a bare `next build`.** A Bash PreToolUse hook backs up the existing `prebuild` guard.
- **Subagent:** a `security-reviewer` agent (in `.claude/agents/`) for any change touching auth, payments, RLS or the AI routes, run before merging.
- **MCP:** the Supabase MCP server in read-only mode would let these RLS and auth-settings checks run directly, against a test project rather than production.
