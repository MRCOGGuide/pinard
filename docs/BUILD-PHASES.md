# PINARD — Build Phases
Copy-paste these into Claude Code **one at a time, in order**. Test each phase before moving on. After each working feature, say: *"Commit this to Git with a clear message."*

**Before Phase 1:** create a folder, put `PROJECT.md`, `AI-PROMPTS.md` and `pinard-logo.svg` inside it, open a terminal in that folder, and run `claude`.

---

## Phase 1 — Foundation
```
Read PROJECT.md fully. Set up the project it describes: Next.js 14 (App Router) with TypeScript and Tailwind, connected to Supabase. Configure the Tailwind theme with the exact colour tokens and the three Google Fonts from the design system. Create ALL database tables from section 6 with row-level security as specified, plus Supabase auth with email/password and the admin/user roles. Build the app shell: logo (use pinard-logo.svg), navigation, the footer disclaimer line, and the signature "trace" header underline component. I am a complete beginner: walk me through creating the Supabase project, enabling pgvector, and where to paste each key into .env.local, step by step. Then show me how to run the app locally and how to make my own account an admin.
```

## Phase 2 — Admin: sections, sources, examples
```
Read PROJECT.md sections 6–7. Build the /admin area, protected so only the admin role can access it: (1) the Sections manager, (2) the Source library with PDF/text upload — for now store the document and metadata without ingestion, (3) the Example questions manager for SBA and EMQ formats. Match the design system. Walk me through testing: I'll create the MRCOG Part 1 and Part 2 section trees, upload one document, and add five example questions.
```

## Phase 3 — Ingestion pipeline (RAG)
```
Read PROJECT.md section 7 (Source library) and AI-PROMPTS.md prompt K. Build the ingestion pipeline as a server-side job triggered on document upload: extract text (including from PDFs), chunk at 600–800 tokens with 15% overlap, embed each chunk with the Voyage AI API, store chunks + embeddings, then run prompt K per chunk and store the extracted key_facts. Show ingestion status and chunk/fact counts in the Source library. Also build the retrieval function: given a query string and section, return the top 8 chunks by vector similarity with their document titles and source references. Walk me through getting a Voyage API key and adding it to .env.local, then we'll test by uploading one real document and inspecting its chunks and key facts in the admin UI.
```

## Phase 4 — Question generation, verification, review queue
```
Read PROJECT.md sections 2 and 7, and AI-PROMPTS.md prompts G and Q. Build: (1) the generation service — server route that retrieves passages for a section, selects 3–4 style examples of the chosen format, calls the Anthropic API with G+Q, and parses the JSON; (2) the verification layer exactly as specified in PROJECT.md section 7, including the UK-English lint list and the regenerate-then-flag behaviour; (3) the admin Generation console; (4) the Review queue with Approve/Edit/Reject and A/E/R keyboard shortcuts, showing each citation with a click-through to the source passage. Walk me through adding my Anthropic API key, then we'll generate 10 questions for one section and I'll review them.
```

## Phase 5 — User app: sampler, onboarding, diagnostic, feedback
```
Read PROJECT.md section 7 (user app items 1–3 and 7) and AI-PROMPTS.md prompts F and C. Build: the free sampler with paywall page using the exact pricing table from PROJECT.md section 4; onboarding (exam part + exam date + countdown); the diagnostic screen with the end-of-diagnostic topic trace chart; and the full feedback screen — result banner, per-option explanations with citations via prompt F, the Similar Values panel driven by a key_facts value-match query (not the AI), and the follow-up "Ask Pinard" chat via prompt C with per-question message history. All question screens max-width 720px, mobile-first.
```

## Phase 6 — Study plan, daily sessions, progress
```
Read PROJECT.md section 7, items 4–6 and 8, and AI-PROMPTS.md prompt P. Build the deterministic study-plan algorithm exactly as described (weak-first weighting, full syllabus coverage, spaced revisits every 7–10 days, final-fortnight mixed papers), regenerating on material performance shifts or exam-date changes, with the narrative from prompt P. Then build the Daily session flow with the selection weighting formula, Free revision mode, and the Progress screen with per-section trace charts against the dashed 70% line, streak and totals.
```

## Phase 7 — Payments, reminders, motivation
```
Read PROJECT.md sections 4 and 7 (items 9–10) and AI-PROMPTS.md prompt M. Integrate Stripe subscriptions with the three paid tiers, the founding-member coupon, customer portal, and webhooks that maintain the subscriptions table; gate premium features on active status. Set up Resend and a daily cron that assembles each user's reminder at their chosen time using prompt M, plus milestone messages. Walk me through Stripe test mode end to end, including a test purchase and cancellation.
```

## Phase 8 — Deploy, then mobile
```
First: walk me through deploying to Vercel with all environment variables and the cron configured, connecting my domain, and a full production smoke test.

Then: add Capacitor to produce the iOS and Android apps from this codebase. Set up push notifications for the daily reminders and integrate RevenueCat for Apple/Google subscriptions at the same price points, coexisting with Stripe web billing. Generate the app icon set from pinard-logo.svg (the mark alone on theatre-green). Walk me through Xcode and Android Studio builds, then App Store and Play Store submission: listing copy, screenshots, the privacy policy (draft one from our actual data practices), and the medical-education disclaimer.
```

---

## Pre-launch hardening (October 2026)
Three phases, in order. Each runs on its own branch, ends with a plain-English report, and waits for the owner's "go ahead" before the next begins.

**All three merged to main and deployed to production on 9 October 2026** (owner's "merge and deploy"; commit c8055f7). Checked on the live site: the legal pages open without the access code, everything else still goes to the gate, security headers present, the reminder endpoint refuses callers without the secret. Nothing is merged to `main` or deployed without approval. No data deletion, schema change, key rotation or Stripe / Supabase / Vercel setting change without asking first.

### Phase 9 — Design and motion  *(branch `phase-9-design-and-motion`)*
Status: **done, approved, merged and deployed (9 October 2026).**

Progress (8 October 2026):
- Step 1 done: audit in `docs/design/DIRECTION.md`.
- Step 2 done and approved: "the guideline page" direction on the question screen and the landing page.
- Landing reworked at the owner's request: four steps (diagnostic, study plan, practise, mock) each with a picture that plays as it is reached; Ask Pinard as its own section; sections fade in and out in both scroll directions; one colour rule for every bar (red below a third, amber to 70%, green from 70%).
- Step 3 done in code: tokens in `tailwind.config.ts` and `globals.css` (palette, type scale, radii, shadows, motion), Inter and Roboto Mono removed, a metric-matched fallback for Newsreader; shared components rebuilt; every page moved onto the system; all-caps labels, middle-dot strings and decorative arrows removed; new 404, error and loading-skeleton pages; light and dark.
- Step 4 done: page entrances, dialogs, bar fills, button press feedback; all 150 to 250ms, transform and opacity, off under reduced motion.
- Owner's review (9 October) done: one wide frame for header and footer on every page; sticky top bar with the current page marked; buttons grow on hover; Pricing and How it works in the wide frame with animation; How it works rewritten around provenance, currency and coverage; Today figures in a card; scroll fades on every signed-in page; mock fixes (diagonal part-answered sets, Back to mock, hand-in dialog); Progress redesigned around a CTG strip; diagnostic wording corrected (fifteen questions across 35 topics).
- Step 5 on public pages: Lighthouse mobile performance 91 to 96, accessibility 100, layout shift 0; axe WCAG 2.2 AA no violations; no sideways scroll at 360px.
- Review rounds 2 to 6 (9 October): slower motion; graded progress bars; connected session trace; diagnostic exit; plan focus in bold and no dashes; mock start, results and hand-in fixed; Account rebuilt; days to go recomputed daily; live section and paper figures; Join the pilot rebuilt; pricing cards clickable as a whole and carried through sign-in to Stripe.
- Signed-in screens were checked by the owner in their own browser; Lighthouse and axe were run on the public pages only.
- Left for later: Supabase's own auth email templates (a Supabase settings change, needs the owner's approval).
1. Audit every screen at phone and desktop widths; list what makes it look generic. No code changes.
2. Propose one design direction (calm, editorial, clinically confident, restrained) and build it on two screens only: the question/answer screen and the landing page. Before/after screenshots. **Wait for approval.**
3. Turn it into a design system (tokens in the Tailwind config: colour, type scale, spacing, radius, shadow, motion), rebuild shared components, apply to every page, emails and error pages; every state (loading skeletons, empty, error, success, disabled, focus); light and dark.
4. Purposeful motion only: 150–250 ms, ease-out, transform and opacity only, `prefers-reduced-motion`, smooth on a mid-range phone; no scroll-jacking.
5. Quality bar: WCAG 2.2 AA, works from 360 px, no layout shift, Lighthouse mobile 90+ (performance and accessibility); copy rewritten for MRCOG candidates.

### Phase 10 — Security  *(branch `phase-10-security`)*
Status: **done (9 October 2026).** All High, Medium and Low findings fixed except L5 (no patched release) and L6 (moved to Phase 11). The owner ran phase41, phase42 and phase43, turned off open sign-up in Supabase, set GATE_COOKIE_SECRET, and confirmed the app works. Branches `phase-10-security` and `phase-10-next15`; merged and deployed 9 October 2026. Report: `docs/security/REPORT.md` (0 Critical, 4 High, 7 Medium, 7 Low); OpenAPI spec: `docs/security/openapi.json`. 42Crunch replaced by the same method by hand (no account).
Report first (Critical / High / Medium / Low, each with what could actually happen); fix Critical and High after approval. Secrets in repo and history; Supabase RLS tested as a visitor and as user A against user B; server-side session and subscription checks on every route and action; access-code gate bypass and rate limiting; Stripe and RevenueCat webhook signatures and idempotency; AI endpoint limits, spend cap, prompt injection, no raw HTML; security headers, cookies, CSRF, input validation, open redirects, error messages; `npm audit` and patched Next.js (CVE-2025-29927); OpenAPI spec and 42Crunch audit and scan until clean; no personal data or keys in logs; automation recommendations (asked before installing). Tested against local or a preview deployment, never production.

### Phase 11 — Legal and compliance  *(branch `phase-11-legal`)*
Status: **done, approved, merged and deployed (9 October 2026).** Full summary, solicitor and accountant items, open items and the pre-launch checklist: `docs/legal/README.md`. Source licence table: `docs/legal/SOURCES.md`. App store requirements: `docs/legal/APP-STORES.md`.

Owner's answers: not registered yet; based in Ireland (sole trader for now, Irish and EU law, Irish DPC); legal details to be filled in later from Admin, so every legal page is editable there; selling to Ireland, the UK, the rest of the EU and worldwide; content from public guidelines, TOG articles, textbooks and past papers; a 14-day full refund replaces the 7-day promise.

Done:
- Terms, Privacy, Refunds rewritten; Cookies and Accessibility added; all readable without the access code; editable in Admin > Legal with the trader details filled in (marked gaps until then).
- Privacy policy matches the code: every provider and location, what each AI feature receives, transfers, retention table, rights. Name no longer sent to the AI. Download my data on Account. Deletion now also removes the pilot review and any published quote.
- Fixed: the public GitHub reminder job printed candidate IDs and failure reasons; it now prints totals.
- Consumer law: 14-day full refund everywhere; "Withdraw from contract here" button for 14 days (EU CRD art. 11a, Ireland S.I. 309/2026), refunding through Stripe and emailing a confirmation; renewal stated on each plan; "Manage billing or cancel"; "VAT included" replaced by "the price shown is the total you pay"; consent box before buying a top-up.
- AI and medical: "Written by AI" on every Ask answer; revision-aid note under explanations and on the mock review.
- RCOG non-affiliation in the footer, Terms and How it works; "Real MRCOG questions" removed from the sample page.
- One-click unsubscribe in reminder emails, with List-Unsubscribe headers; waitlist consent wording.
- Security audit L6 (Ask text in the failures log) handled by `supabase/phase44-retention.sql`, which the owner ran on 9 October 2026.
- Owner's follow-ups (9 October): Voyage training opt-out done and stated in the policy; processing locations kept as they are; VAT at checkout built behind `STRIPE_TAX_ENABLED` (VAT-inclusive, checked in Stripe test mode), with the live set-up steps in `docs/legal/README.md`; withdrawal refund tested end to end in Stripe test mode; "TOG" removed from the marketing copy and the candidates' section renamed "High-Impact Articles" (database title changed); the owner's position on TOG and the style book recorded in `docs/legal/SOURCES.md`.
- Similarity check (owner's request): the generator discards any question whose stem or explanation echoes a style-book example (`src/lib/exampleSimilarity.ts`; audit `scripts/audit-example-similarity.mts`, also in the Revise skill). The 2,014 questions in the bank: none too close.
- Fixed a fault from Phase 10: the `server-only` guard stopped every script in `scripts/` from starting. Scripts now run with `npx tsx --conditions=react-server` (the Revise skill and `package.json` updated); the guard stays.

Brief:
Owner questions first (one at a time): registration, company or sole trader, legal name and address, countries sold to, content sources. Then: privacy policy matching the code (UK GDPR / DPA 2018 / EU GDPR, every processor, transfers, retention, rights, working deletion and export); cookies (PECR) and consent if needed; consumer law for subscriptions (price with tax, auto-renewal, easy cancellation, 14-day right and digital-content waiver, refunds, VAT); Terms, Privacy and Refunds readable without the access code; medical and AI disclaimers and labelling (EU AI Act transparency); RCOG non-affiliation and a source licence table; accessibility statement; marketing email opt-in and unsubscribe; app store requirements listed. Every item that needs a solicitor is marked.

---

## Pricing tiers (October 2026)  *(branch `feat/pricing-tiers`)*
Four tiers (Free, Basic, Plus, Premium), monthly and three-monthly, regional prices by card country, Annual removed. Stripe test mode only; Phase 1 read-only and stops for approval.

### Phase 12a: Cost and pricing
Status: **prices approved by the owner, merged and deployed (10 October 2026).** Version 2.1: sell through Stripe Managed Payments (merchant of record) so tax worldwide is collected and paid by Stripe and only Irish tax is the owner's; Lower Premium three-month €95; founding offer on Basic and Plus only. Managed Payments enabled in Stripe test mode with the owner's go-ahead. Fix A shipped on the branch (forced tool call; €0.037 a question measured, was €0.056). Monthly Ask Pinard allowances pooled over the billing period (Basic 30, Plus 160, Premium 450 a month), top-up packs (50 for €5, 150 for €12), a 60-a-day fair-use limit; Standard €19/€45, €29/€69, €45/€105 net. Version 1 kept below it in the document. `docs/PRICING-MODEL.md`, with the model and measured data in `docs/pricing/`. Headline: an Ask Pinard question costs €0.056 today; half of open questions are paid for twice because the reply fails the JSON format check; fixing that (fix A) brings it to €0.032 and makes every proposed price pass the cost-plus-30% floor.

### Phase 12b: Build
Status: **built, tested, approved, merged and deployed (10 October 2026).** Live mode waits on the owner's checklist, `docs/pricing/LIVE-CHECKLIST.md`; until then checkout on the live site returns to the pricing page with "not set up yet" and charges nothing.
- One configuration file, `src/config/pricing.ts`: tiers, allowances, regional prices, top-ups, features, blocked countries.
- Stripe test mode, through `scripts/stripe-tiers-setup.mjs`:
  - 18 tax-exclusive prices and the two top-up packs;
  - one billing portal per region (upgrades at once with proration; downgrades and shorter periods at period end).
- Checkout runs under Stripe Managed Payments (merchant of record), in place of the Payment Element, because Managed Payments supports only Stripe's own checkout.
- Entitlements from the webhook:
  - tier, period and region come from the price's own metadata;
  - the Ask Pinard allowance is counted per billing period, safe under simultaneous requests, with a 60-a-day fair-use counter.
- Card-country safety net: a refund and cancellation on a dearer-region card; otherwise a 30-day notice before a change at renewal.
- Pricing page:
  - the visitor's own prices only, server-decided; time zone and language can only move a visitor to Standard;
  - the toggle, four cards with the same feature rows, Plus recommended and first on a phone;
  - VAT included where Stripe Tax can calculate it.
- Upgrade moments: the Ask meter and limit panel with top-ups and a one-tap upgrade, the free diagnostic's single button, and exam-date coverage.
- The free sample is 15 questions, at `/practise/free`.
- Funnel events (no cookies, nothing recorded when the browser asks not to be tracked) and Admin > Conversion with the sharing flags.
- The legal pages are updated, with the new clauses marked for legal review.
- Tests: `scripts/test-pricing.mts`, 41 of 41 pass.
- Owner's checklist: `docs/pricing/LIVE-CHECKLIST.md`.
- Owner's review, 10 October 2026: phase45 run (daily fair-use test now passes, 41 of 41); the billing-period toggle slides and the new prices ease in when it is switched; Free reads "15 sample questions" and "Sample diagnostic", with the full diagnostic from Basic; the comparison table removed (it repeated the cards); buttons aligned across the cards; landing-page sections alternate between the page colour and white.
- Owner's second review, 10 October 2026: the top bar is frosted white glass (it opens the white and sage alternation above the sage first section), and its links slide a pill to the page you are on, the same motion as the billing-period toggle.

---

## Claims audit and diagnostics (October 2026)  *(branch `audit-claims-diagnostic`)*
Owner's request, 10 October 2026, before Phase 13: audit the site so every claim matches what it does, add a cookie banner, fix the free sample diagnostic to a fixed set, and shorten the full diagnostic.

Status: **approved, merged and deployed (10 October 2026).** phase46 and phase47 run by the owner; phase46 regenerated for the shorter free diagnostic (owner to run again).
- Faults found and fixed:
  - **The free diagnostic** served only questions from the 15 free sample questions, because a free account can read no others (phase45), so it came back short and repeated the sample.
  - **Free accounts cost AI money:**
    - the daily reminder job emailed every account with reminders on, free ones included, each email AI-written (reminders are a paid feature);
    - the Today page had the AI write a free account's plan summary.
  - **Free accounts saw paid features:** Progress and readiness, and a Today card offering a session and plan that only led to the price list.
- Free sample diagnostic:
  - fixed questions, the same for every free account, one item per section: 27 SBAs and 8 whole EMQ sets (23%), 51 questions at difficulty 1 to 5;
  - excludes the 15 sample questions and the public sample page;
  - picked by `scripts/pick-free-diagnostic.mts` and pinned by `supabase/phase46-free-diagnostic.sql`, which needs the owner's go-ahead because it adds a table and one clause to the question-bank read rule.
- Full diagnostic:
  - two SBAs (one easier, one harder) and the shortest EMQ set per section, unseen first: about 166 questions, 2 hours 46 minutes to 5 hours 32 minutes on today's bank;
  - a pop-up before the start gives the time at 1 to 2 minutes a question;
  - the place is saved on the device after every item, so it can be resumed.
- Free plan preview, worked out by fixed rules with no AI:
  - the first fortnight, in this order: easy misses in Obstetrics and Gynaecology, then other clinical misses, then governance and the high-impact papers;
  - the rest of the plan blurred under glass, with a link to the plans and the limited-preview disclaimer.
- Cookie banner:
  - Accept and Reject at equal weight, with "Cookie settings" in the footer;
  - `pinard_price_check` is now set only after Accept; without it the price check runs on each visit, and checkout re-checks the same two browser signals from the form, so the price charged is still the price shown;
  - Cookie Policy and Privacy updated.
- Wording brought into line on the landing page, FAQ, pricing lede, the Free card ("Plan preview: your first two weeks"), Account and Today.
- Tests: `scripts/test-diagnostic.mts` (30), pricing 41 of 41, mock, reminders and cron all pass. `test-readiness` has one failure ("39 is red") that predates this branch.
- Owner's review, 10 October 2026 (phase46 run; test free account allowed):
  - **Free tier checked as a real free account** on a local server with pilot mode off: 51 fixed questions in order across 35 sections; 15 sample questions, none of them in the diagnostic; none of the paid bank readable; Today, plan preview, Account and Progress as intended. Test account: pinard-free-check@example.test (no password; delete when no longer needed).
  - **Mock paper counted as the RCOG counts it:** 50 EMQs means 50 scenarios (the RCOG numbers EMQ answers 1 to 50 under option lists of one to five), in whole sets, 132 seconds and one mark each. Four papers built from the bank: 50 SBAs and 50 EMQs in 17 or 18 sets, 180 minutes.
  - **"Approved by a Member of the RCOG"** everywhere, the FAQ included.
  - **Postoperative Care:** 19 approved questions about care after an operation (7 SBAs, 4 EMQ sets, obstetric and gynaecological) linked to it, and one added to the free diagnostic, by `supabase/phase47-postoperative-care.sql` (owner to run; the undo is in the file). A direct write to the live database was refused by the safety check, rightly.
  - **Free sample diagnostic shortened** (owner's second review): at most 35 questions and one per section, each EMQ a single scenario with its option list. Today's bank gives 27 SBAs and 8 EMQs across 35 sections, Postoperative Care included, Patient Information Leaflets left out (the last governance section goes first when over 35). A free candidate can see their results so far after 20 answers, with their place kept to finish later.
  - **Prices raised (version 3)** on the owner's instruction to price for profit against the market: Standard €29/€69, €49/€119, €79/€189; top-ups €8 and €20. Still below the RCOG's revision collection and Pipador, and every price, founding price and top-up clears the cost floor. Stripe test mode updated; live prices come from the same config when the owner runs the setup script. Reasoning: `docs/PRICING-MODEL.md`, version 3.

---

## Ask Pinard allowances, what sets Pinard apart, and a glass finish (October 2026)  *(branch `ask-allowance`)*
Owner's request, 10 October 2026: show the Ask Pinard limit in bold, give more if the version 3 prices allow it, and highlight Pinard's strengths against the competition.
Status: **merged and deployed (10 October 2026).**
- Monthly allowances 30/160/450 raised to **50/200/500** (three times that on the three-month plan). Every plan, founding price and app-store price still clears the cost floor; the tightest is Lower Premium three-monthly, €129 against €105.09 (`docs/PRICING-MODEL.md`, version 3.1).
- The allowance is shown in bold on every paid card. Ask Pinard stays the last line, as before (owner's choice; it was briefly moved first).
- "What a book can't do" (owner's request: show only what sets Pinard apart, say nothing found elsewhere on the page, few words, animation instead). Two animated panels, on the landing page before the plans and on /pricing under them:
  - old guidance retired with its questions, new ones written from the update;
  - missed questions back on day 3, 10 and 25 until right three times running.

  "Refreshed every quarter" was taken out of the landing page's library line, so it is not said twice. No competitor is named. Reduced motion shows the final state.
- Glass and an Apple-like finish (owner's request):
  - rounder corners (cards 18px, controls 12px) and softer layered shadows across the site;
  - frosted glass on everything that floats over content: the top bar, dialogs (over a blurred page), the cookie banner, the mock's timer bar, the phone answer bar, and the card over the blurred plan;
  - text panels use a nearly opaque glass, so words behind never show through; the cookie banner was hard to read before. Checked in light, dark and on a phone.
- Applies to current subscribers at once, since the allowance is read from the config. Terms and Account read the same figures.
- Tests: pricing 41 of 41.

---

## Ask Pinard test bench (October 2026)  *(branch `ask-allowance`)*
Owner's request, 10 October 2026: make Ask Pinard fast, accurate and reliable, as cheaply as possible, by testing it and feeding back.
Status: **phase48 run by the owner; merged and deployed (10 October 2026).**
- **Approach:** no model training. Fine-tuning would cost more, is not offered for this model on Bedrock, and does not stop invented facts. The answers are already grounded:
  - the model sees only passages from the library;
  - every cited passage must be one it was given;
  - every figure must appear in those passages, or the draft is sent back.

  Faults are fixed at their cause: a missing guideline (add it to the library), a search that missed the passage, or a prompt the model misreads.
- **Admin > Ask Pinard:** ask as a candidate would and see the answer exactly as they would, with:
  - the time it took, and the search time;
  - the passages the search found;
  - any draft the checks sent back.

  Rate it Good, Needs work or Wrong, with what was wrong and what it should have said. Kept in `ask_reviews` (`supabase/phase48-ask-reviews.sql`, admins only). About 4 cents a question.
- `scripts/eval-ask.mts`:
  - `--list` prints the ratings for diagnosis;
  - with no flag it asks every rated question again and compares;
  - `--faults` asks only those marked down.

  Read-only; about 4 cents a question.
- Measured 10 October 2026, 3 questions: 5 to 13 seconds an answer. The slow one had a draft sent back by the checks and asked again; the search takes about 1 second.
- "What a book can't do" removed from /pricing at the owner's request; it stays on the landing page.

---

## 36 sections; Postoperative Care under Gynaecology (October 2026)  *(branch `sections-36`)*
Owner's request, 10 October 2026. Merged and deployed the same day.
- The site's section count now includes High-Impact Articles, which stands outside the three modules but is practised and examined like any other section: 36, read live from the database (`lib/library.ts`). Postoperative Care was already in the old count of 35. How it works names the four groups.
- `supabase/phase49-postoperative-under-gynaecology.sql` (owner to run) moves Postoperative Care from Governance to Gynaecology, in alphabetical order after Pelvic. The undo is in the file.

---

## Ask Pinard: answers laid out as NICE and the GMC set them out (October 2026)  *(branch `ask-structure`)*
From the owner's first three reviews, 10 October 2026: one Good, two Needs work.
Status: **merged and deployed (11 October 2026).**
- **Faults found, and their causes:**
  - A many-sided scenario (36, smoker, BMI 36, previous DVT, booked at 12 weeks) was answered on VTE alone. One search for the whole scenario found only VTE and age passages, so pre-eclampsia, gestational diabetes, smoking and haemorrhage were never in front of the model. It also advised pre-pregnancy counselling at 12 weeks.
  - A counselling question had no counselling structure, and "another ground" stood in for the named ground under the Abortion Act.
- **Issue-by-issue search:** a short first step (Claude Haiku, about a second) lists the issues a complete answer must cover, each risk factor and what it raises, birth and after birth included, with a search for each. All searches are embedded in one call and run together. This applies only to questions long enough to be a scenario. The plan decides only what is looked up; the answer is still written from the passages and checked.
- **The layout is chosen in code, not left to the model:** single fact; condition in pregnancy (Risks first, as NICE begins); scenario (Risk assessment first, then care from where she is); gynaecology; counselling (as the GMC's decision making and consent: Where things stand, Options, Benefits, Risks, Alternatives, Supporting their decision); breaking bad news (Setting, Perception, Invitation, Knowledge, Emotions, Strategy and summary).
- **A scenario's risk assessment is a required field of the answer.** Told in words, the model skipped it every time. It carries no figures, so no unverifiable number enters through it.
- **New rules:**
  - only what she qualifies for;
  - nothing already past;
  - every risk factor gets an answer;
  - name the ground, the act, the standard.
- **Length is checked,** and an answer far over its limit goes back.
- **Fixes along the way:**
  - the clean-up step that drops a preamble was deleting the new first stages;
  - stray ",." left behind when citations are removed.
- **Re-tested on the owner's three questions:**
  - accreta: 4 seconds, unchanged;
  - scenario: risk assessment, then every factor acted on, including LMWH timed around regional anaesthesia and birth, and contraception after VTE;
  - counselling: in the GMC order, with Ground E and Montgomery.

  A scenario now takes 25 to 45 seconds, a single fact about 5.

---

## Ask Pinard: accuracy first (October 2026)  *(branch `ask-quality`)*
From the owner's second review, 11 October 2026: two answers marked Needs work, too long and not focused. He asked for "relevant, correct, concise", with speed secondary.
Status: **merged and deployed (11 October 2026).**
- **Focus:** the prompt now answers the step asked and stops:
  - a woman presenting with a symptom gets the concern and the first investigations, not treatment that depends on results not yet known;
  - every line must be one an examiner would mark;
  - limits of 100 to 300 words by kind of question, three bullets a stage;
  - a new layout for presentations: Concern, Investigations, and Immediate management only if needed;
  - the search plan stays within the step asked.
- **Model:** answers are written by Claude Opus 4.6, falling back to Sonnet 4.6 if Opus is refused or over its small daily quota. On all five reviewed questions, Opus kept to the point where Sonnet wandered and once contradicted itself. The Claude 5 models are on Bedrock but not enabled for this account; enabling them is the owner's AWS setting.
- **Line-by-line check:** Sonnet 4.6 reads each line beside the passages and removes, never rewrites, any line that is misread (e.g. "duodenal atresia in a third of babies with T21", the passage saying the reverse), not for her, or beside the point. It is calibrated to judge only what a line states, to count a fact found in any passage, and to keep a line when unsure. It runs within one 56-second budget.
- **Cost:** about €0.11 a question, against €0.05. At the owner's choice, prices stay and allowances become 50, 120 and 230 a month. Top-ups become €10 and €29. Lower Plus three-monthly leaves the founding offer. All plans clear the floor (`docs/PRICING-MODEL.md`, version 3.2). Stripe test mode updated.
- **Tests:** on the owner's five questions every answer is concise and in the right layout, and the check removed real misreadings. Pricing 41 of 41.

## Ask Pinard: pathways prepared in advance (October 2026)  *(branch `phase-ask-pathways`)*
From the owner's brief of 11 October 2026 (`pinard-assistant-instructions.md`). His deliberately complex scenario (40, Para 1, Jehovah's Witness, BMI 31, smoker, Rh D negative after declining anti-D, ITP) got the risks right but not the management, and was slow. The cause: management was worked out from raw passages on every question. An obstetrician recognises a risk factor and follows the known pathway; Ask Pinard should too.
Status: **parts 1 and 2 merged and deployed (12 October 2026).** Parts 3 to 8 to come, on a new branch.

### Part 1: what was found (11 October 2026)
- Each question runs four steps: Haiku 4.5 plans the searches (3.5 s), the library is searched (1 to 3 s), Opus 4.6 writes the answer (17 to 23 s), Sonnet 4.6 checks it line by line (3 to 5 s). Nothing streams, so the first word appears only when the whole answer is ready: 26 to 30 s, and 45 s when a draft is sent back.
- The owner's scenario failed outright once: "foetal" sent the draft back, the rewrite ran out of time, and no answer was shown.
- Named risks went unmanaged (diabetes, blood pressure, growth), partly because of the three-bullet cap set the day before, and partly because the management depended on what the search happened to find: the same question lost its VTE plan on one run and kept it on another.
- The library had no ITP guidance (the owner has since added the NHS Scotland guideline), no NICE antenatal care guideline (the visit schedule the brief asks for), no NICE twin and triplet guideline, and no hepatitis B or C guidance. Three guidelines are held twice (ESC 2025 as 92 and 1012, BHIVA 2025 as 5 and 53, BSH red cell antibodies as 7 and 36), which crowds other sources out of a search.

### Done on the branch
- **Spelling corrected, not sent back:** an Americanism in an Ask Pinard reply is now corrected in place (`ukEnglishCorrected`), so a spelling slip no longer costs a 40-second rewrite.
- **Close the loop:** a complex pregnancy loses the three-bullet cap; every risk in its assessment must have its action in a later stage, or be named as not covered. Attempts may take 36 s (was 25 s). The owner's scenario now answers in 35 s with no rewrite, ITP managed from the new guideline.
- **Pathway library (part 2):**
  - `supabase/phase50-pathways.sql`: one new admin-only table, `pathways`. **For the owner to run.**
  - `scripts/pathway-topics.mts`: the owner's starter list and the medical conditions the library covers (37 topics), each with its primary documents.
  - `scripts/build-pathways.mts`: reads each topic's primary guidance in full (up to 45,000 tokens, else its best-matching passages) plus a search of the whole library; Opus 4.5 drafts the record, every item with its chunk ids; items citing a passage not given, or stating a figure no cited passage contains, are removed; Sonnet 4.5 then removes any item its passages do not support with the same meaning, for a different group, in the wrong field, evidence rather than pathway, or a duplicate. Disagreements between documents are kept as both positions for the owner. Built with Opus 4.5 and Sonnet 4.5 so the daily quotas live answers use are untouched. Drafts are kept out of the public repository (`scripts/_pathways/`) and loaded with `--load`.
  - **Admin > Pathways:** every pathway by kind and status; each opens to its lines with the source passage one click away, "Remove this line", a choice where sources disagree, and Approve or Needs changes. Only approved pathways will drive answers.
- **Separately (branch `fix-table-figures`):** four ITP questions were rejected because the PDF reads "≥ 70x 10 /l" and the table check took "70x" as one word; it now splits a number from a letter. Not merged. Questions 2076 to 2080 and 898 key facts from the ESC guideline, generated while it carried the ITP upload's reference, now read "European Society of Cardiology (ESC)" (data correction at the owner's request).

- **Drafts built and loaded (12 October 2026):** 37 pathways, 3,403 lines, 5 disagreements between sources for the owner to choose, about 150 lines removed by the checks. All drafts; none approved yet. The two referral pathways (high-risk clinic, fetal medicine) are pieced together from service reports, as the library has no referral guideline.
- **Owner's brief for EMQ sets:** `scripts/generate-with-brief.mts` generates a set from one document to a stated topic, through the normal checks into the review queue. Used for two ITP sets: causes of a low platelet count (2086 to 2090, with a comparison table) and platelet levels for each intervention (2091 to 2095, with the guideline's tables). Q2081 corrected (count raised to 82 so only ventouse is wrong; the thresholds table removed, as the answer rests on the fetal bleeding risk, not her count).

### Still to do
- Part 3, the reasoning framework (risks to mother and baby, the patient's journey from her current stage, close the loop); Part 4, the legal index; Part 5, gynaecology pathways; Part 6, speed (stream the answer, look pathways up instead of searching, cache the instructions); Part 8, the fixed test set, with old and new answers and timings side by side for the owner.

## Admin > Billing: prices editable again (October 2026)  *(branch `billing-price-editor`)*
The owner found he could no longer change prices: the four-tier pricing work (10 October) had moved every price into `src/config/pricing.ts` and removed the editor.
Status: **merged and deployed (12 October 2026).**
- Every plan price (three regions, monthly and three-monthly) and both top-ups can be changed in Admin > Billing. Saving makes a new Stripe price with the same product, period, tax treatment and metadata, moves the lookup key checkout uses and the region's billing portal to it, archives the old one, and only then keeps the amount (`app_settings`, key `price_overrides`) for the pricing page, the Terms and the account page. Existing subscribers keep their price.
- Refused below the cost floor (worst-case cost at full use plus Stripe's fees, plus 30%: `planFloorCents`, the same formula and figures as `docs/pricing/pricing-model.py`), and below it after the founding offer's largest discount on a plan the offer reaches.
- `scripts/stripe-tiers-setup.mjs` reads the saved prices, so running it (for example with the live key at launch) never puts an old price back. Price ids are cached for 30 seconds, not 10 minutes.
- Pricing tests 41 of 41. Not yet exercised against Stripe by a real save: the owner's first change is the first.

---

## After launch — ongoing loop
- Upload new guidance → generate → review → approve. Fresh questions keep subscribers.
- Watch the flagged-verification and user-flag lists weekly.
- Recruit 5–10 colleagues sitting the next diet as free beta testers before charging anyone.
