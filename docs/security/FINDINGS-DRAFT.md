# Phase 10 security audit: draft findings (in progress, 9 October 2026)

Nothing has been fixed yet. Fixes wait for the owner's approval.

## Checked so far

- **Secrets:** none found in the current files or anywhere in the 354 commits of git history. No secret uses a `NEXT_PUBLIC_` name. The service-role client is imported only in server code.
- **Row-level security:** switched on for all 27 tables. A trigger stops users making themselves admin.
- **Access tiers:** decided on the server from data users cannot edit (role, subscriptions, invite redemptions).
- **Actions and routes:** every admin action calls `requireAdmin`. Cron routes need the cron secret. Ask Pinard checks sign-in, paid access, input length and a turn or monthly limit.
- **Next.js 14.2.35:** includes the fix for CVE-2025-29927.
- **Raw HTML:** AI output is never rendered as raw HTML.

## Findings so far

| Rank | Finding | What could actually happen |
|---|---|---|
| High | `generated_questions: users read approved` lets any signed-in user, free tier included, read every approved question with its answer and explanation straight from the Supabase API. | A free user downloads the whole paid bank with the public key and their own login. |
| High | The access-code gate (`/api/gate`) has no limit on attempts. | Someone can guess the code by brute force. |
| Medium | The gate cookie is `btoa(password)`: the code itself, merely encoded. It is not marked `secure`, and it is compared with a plain `===`. | Anyone who sees the cookie learns the access code. |
| Medium | `key_facts: users read` uses `using (true)`. | Any signed-in user can read every extracted guideline fact. |
| Medium | `profiles.stripe_customer_id` is writable by its owner, and `/api/stripe/portal` trusts it. | A user who learns another customer's ID could open that person's billing portal. The IDs are hard to guess. |
| Medium | `BETA_FULL_ACCESS=true` is the default in `.env.example`. | If it is set in production, every signed-in user gets the paid product. The owner should check Vercel. |
| Low | The user can write their own `user_answers`, `user_topic_performance`, `mock_attempts`, `study_plans` and `chat_messages` rows. Ask Pinard on Today accepts client-supplied history, including forged assistant turns. | A user can falsify only their own progress, or steer their own answers. |
| Low | `lib/supabase/admin.ts` has no `server-only` guard. The cron secret is compared with `===`. | No leak today; these are guards against future mistakes. |

## Still to check

- Webhook signature verification and idempotency.
- The RevenueCat webhook.
- Rate limits on `verifyInvite` and `joinTheList`.
- Security headers (CSP, HSTS and the rest).
- Cookies, CSRF and open redirects.
- Input validation.
- Error messages.
- `npm audit`.
- An OpenAPI spec and the 42Crunch scan. These need the owner's 42Crunch account.
- Personal data in logs.
- Live RLS tests as a visitor and as user A against user B. The local app uses the production database, so this needs the owner's decision.
- claude-code-setup recommendations.
