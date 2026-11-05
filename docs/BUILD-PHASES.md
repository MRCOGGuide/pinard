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
- Part 3, the reasoning framework: on branch `phase-ask-aids` (see "Ask Pinard, part 3" below). Part 4, the legal index; Part 5, gynaecology pathways; Part 6, speed (stream the answer, look pathways up instead of searching, cache the instructions); Part 8, the fixed test set, with old and new answers and timings side by side for the owner.

## Admin > Billing: prices editable again (October 2026)  *(branch `billing-price-editor`)*
The owner found he could no longer change prices: the four-tier pricing work (10 October) had moved every price into `src/config/pricing.ts` and removed the editor.
Status: **merged and deployed (12 October 2026).**
- Every plan price (three regions, monthly and three-monthly) and both top-ups can be changed in Admin > Billing. Saving makes a new Stripe price with the same product, period, tax treatment and metadata, moves the lookup key checkout uses and the region's billing portal to it, archives the old one, and only then keeps the amount (`app_settings`, key `price_overrides`) for the pricing page, the Terms and the account page. Existing subscribers keep their price.
- Refused below the cost floor (worst-case cost at full use plus Stripe's fees, plus 30%: `planFloorCents`, the same formula and figures as `docs/pricing/pricing-model.py`), and below it after the founding offer's largest discount on a plan the offer reaches.
- `scripts/stripe-tiers-setup.mjs` reads the saved prices, so running it (for example with the live key at launch) never puts an old price back. Price ids are cached for 30 seconds, not 10 minutes.
- Pricing tests 41 of 41. Not yet exercised against Stripe by a real save: the owner's first change is the first.

## Ask Pinard: decision aids from the guidelines (October 2026)  *(branch `decision-aids`)*
The owner, 12 October 2026, on the pathway drafts: "not what I meant". Each guideline already holds its decision logic in tables and flowcharts, often in the appendices (the aspirin indications, the VTE risk assessment chart, the chickenpox contact algorithm). Pinard should follow those, as drawn, rather than pathways rewritten from the prose. The 37 pathway drafts are hidden from Admin (their rows stay in the database, untouched, at the owner's choice).
Status: **merged and deployed (12 October and 2 November 2026); phase 51 run by the owner.**
- **Pilot findings:** tables transcribe reliably (3 of about 860 boxes and cells not found word for word). Flowcharts do not, read whole: GTG 37a's Appendix I is printed sideways, and read from the PDF it was misgrouped every time (hospital admission and five other factors put at high risk instead of intermediate), by Opus 4.5 and Sonnet 4.5 alike. Rendered sharp, turned upright and cropped to one part, Opus 4.5 read it correctly.
- **Pipeline (`scripts/build-decision-aids.mts`):** candidate pages found from their text (captions, appendices, layout, sideways text); rendered by Windows' own PDF engine (`scripts/render-pdf-pages.ps1`, nothing installed) and turned upright; Opus 4.5 finds each aid and it is cropped (`scripts/crop-images.ps1`); Opus 4.5 transcribes it verbatim with its structure; three checks, each kept as a flag for the owner: wording against the page's own text, a second look at the image (with one re-reading when it disagrees), and the guideline's written recommendations read for contradictions. Opus 4.5 and Sonnet 4.5 only, so live answers' quotas are untouched. Pages are rendered by Windows itself, so `pdf-lib` (approved for cutting pages) was not needed after all and is not installed.
- **Scope:** about 318 guidelines (Green-top, NICE, BSH, BHIVA, BASHH, Scientific Impact Papers and similar); TOG articles, leaflets and reports left out.
- **`supabase/phase51-decision-aids.sql`:** one admin-only table, `decision_aids`. For the owner to run.
- **Admin > Decision aids:** each aid with the crop of the original beside the transcription, the checks' findings, a link to the guideline at that page, and Approve, Needs changes or Not a decision aid. Only approved aids will be followed by Ask Pinard (part 3, next).
- **First full run (12 and 13 October 2026, EUR 40 cap at the owner's choice):** RCOG Green-top first, then clinical RCOG papers, NICE, and the other bodies (BSH, BHIVA, BASHH, BGCS, BMS...). 138 documents read, 311 decision aids in Admin (220 tables, 59 flowcharts, 32 boxes) from 76 of them; about EUR 37.50 spent in all. 128 documents not yet read: Scientific Impact Papers and RCOG statements and policy papers, about EUR 12 to finish.
- **What the run taught:** Sonnet as finder listed recommendation tables and fragments of single charts (55 "aids" in GTG 69); Opus finds them, strictly, a chart being one aid. Only captioned tables and figures and the appendices are read (BJOG's letter-spaced headings, "A PPE N DI X 1", matched too). Pages that are mostly a picture are turned upright by the finder from the image (the publisher's vertical download stamp misled the text-based check), and their wording is marked as unverifiable. Oversized pages go as JPEGs, downscaled if needed; the renderer has a time limit after one page hung it for 50 minutes. The 231 unreviewed drafts from the first 22 guidelines, made before these fixes, were deleted and redone at the owner's approval.
- **The owner's review (2 November 2026):** all 311 reviewed: 250 approved, 57 needing changes, 4 not decision aids. All 57 corrected: 72 tables (45 of them approved) repeated their headings as the first row, now removed, and 22 whose only fault that was are approved; 15 flowcharts rebuilt to the structure the owner wrote out (read literally by indentation, checked against the picture where the note was ambiguous: placenta praevia, FGR, endometrial hyperplasia); 20 specific edits (UKMEC columns, BGCS/BMS colour codes, the anti-D checklist, merged rows, headings), plus three new aids (the amber sepsis flags, and the contraception infographic split into its three tables). 38 are back with the owner for a quick check, each with a note of the change.
- **Owner's view of the checks:** the automatic checks' findings were not helpful (the aids mostly right), so they are no longer run or shown. The pages were slow: requests now run together, pictures are shown as web-sized copies (188 KB on average, against up to 6 MB) with the original linked, and both pages show a loading line at once.
- **Scientific Impact Papers:** read on 2 November 2026 at the owner's request (cap EUR 8).

## Ask Pinard, part 3: the reasoning framework, and decision aids in answers and questions (November 2026)  *(branch `phase-ask-aids`)*
From the owner, 2 November 2026: "go ahead with Part 3 and use them for questions too" (the brief's part 3, and the approved decision aids).
Status: **merged and deployed, 2 November 2026,** at the owner's word ("Draft the aspirin and GDM aids, then merge and deploy").
- **Decision aids in answers (`src/lib/decision-aids.ts`):** the planning step (Haiku 4.5) now runs for every question and is shown a one-line catalogue of the approved aids (272, read every ten minutes, cached in the prompt). It picks up to five that apply to her. Their text goes before the passages, to be followed exactly and cited as `[aid:N]`; an aid not given cannot be cited, figures may come from an aid, the line check reads aids as sources, and an aid cited is listed under the answer by its guideline. Only approved aids are ever used.
- **The framework (prompt A, `src/lib/prompts.ts`):**
  - an obstetric case's risks to the mother apart from risks to the baby;
  - a medical condition's effect on the pregnancy and pregnancy's effect on the condition;
  - care along her journey from the stage she is at: Preconception, Booking, Antenatal (by gestation), Timing and mode of delivery (with reasons), Intrapartum (monitoring, the risks of labour and how likely, how reduced and managed, the case's own questions such as declining blood, OASI, assisted birth, a shortened second stage, the third stage), Postpartum (follow-up before discharge, future risk with its figure, contraception always);
  - the answer matched to the question: a narrow question gets only its answer.
- **Shapes:** a condition in pregnancy opens with its effect both ways (sent back above 400 words, asks 300); a pregnancy with risk factors or a medical condition gives her risks in two fields, to the mother and to the baby, each naming the stage that manages it (sent back above 750, asks 550: at 650 the owner's scenario, 691 words, and the preconception case, 767, were lost). "Watch for" is folded into Antenatal, as the brief's stages have it.
- **Close the loop, in code:** a risk said to be managed in a stage the answer does not have, a missing stage from hers to Postpartum, no contraception, or an answer over its length, sends the answer back once if there are 18 seconds left; otherwise the answer stands rather than being lost. Invented citations and figures still always send it back; if there is no time to rewrite, the lines carrying them (at most three) are removed, never rewritten, and the rest is shown. More than three and the answer is withheld as before. (The owner's scenario was lost once over one figure, "1.5", in an otherwise sound answer.)
- **Fixes from the first test run:**
  - the passages now carry their document's title, not only the reference: a TOG article is cited by its DOI alone, so a care pathway for women aged 45 or over (a glucose test at 16 to 18 weeks) was applied to women of 36 and 40;
  - the line check is told an overall-management question asks for every stage (it removed a preconception plan's pregnancy plan as "not this step");
  - the line check is told to compare figures as numbers: twice it removed "age 36: VTE risk factor" as "36 is not > 35";
  - contraception after birth is always searched for, in plain words (with her first issue appended, the search found only anti-D passages), and the line check is told contraception is always in scope;
  - the planner prefers the chart that turns risk factors into a decision over the list of them (given only GTG 37a's Table 1, an answer counted her three VTE risk factors and never said LMWH from 28 weeks);
  - the trace records the planning step's own time (`planMs`).
- **Gaps for the owner:** no approved aid gives the aspirin indications for pre-eclampsia or the risk factors that call for a glucose tolerance test. NICE sets both out as lists in its recommendations, not as tables or figures, so the decision-aid run never read them. Drafted at the owner's request (2 November 2026), from the recommendations' own words, as drafts in Admin > Decision aids with pictures of the source pages, for his review: NICE NG133 recommendations 1.1.2 and 1.1.3 (who should take aspirin, a flowchart), RCOG GTG 31 on aspirin (who, 150 mg at night from 12+0 to 36+6 weeks, when to start and stop, a table) and NICE NG3 recommendations 1.2.2 to 1.2.8 (who is offered an OGTT and when, and the diagnostic levels, a flowchart). The two aspirin aids differ on dose and stopping (NICE 75 to 150 mg until birth; RCOG 150 mg at night to 36+6 weeks), and Ask Pinard has no rule yet for RCOG over NICE where they differ. The library still has no NICE antenatal care guideline, so Antenatal is ordered by gestation from the passages found, not by NICE's visit schedule.
- **Decision aids in question writing (`src/lib/generate-batch.ts`, `src/lib/generation.ts`):** each question or EMQ set is shown up to three approved aids from the guidance its passages come from, chosen by how much of their wording the passages share. They guide what is tested: a decision point (a branch, a threshold, a timing), with wrong options from other branches; the answer must agree with the aid. They are a guide, not a source: citations and every check still run against the passages only.
- **Test against the live library (2 November 2026, nothing deployed or stored):** five questions asked of `main` and of the branch: the owner's last rated scenario, his rated booking case, a preconception case (type 1 diabetes), epilepsy in pregnancy, and a narrow aspirin question. On the final code all five answered: 42, 31, 28, 18 and 8 s, against 33, 27, 24, 23 and 7 s on `main`; overall management runs to 450 to 700 words, against 380 to 470. The owner's scenario answered in 7 of 9 runs on the branch, all 5 after the length and figure fixes. Contraception appears in every pregnancy answer. Question writing: with the chickenpox algorithm the questions tested its decisions (referral timing, aciclovir from day 7) where without it one tested a percentage; with aids chosen by the passages, GTG 37a's risk-assessment chart reached the questions (three risk factors, LMWH from 28 weeks). Side by side for the owner: https://claude.ai/artifact/5J1HR6Y4dF4ZHk4MRGmhYj (private). Cost of the testing about EUR 3.
- **Still missing:** the third stage (active management) and the legal position on declining blood in the owner's scenario; the legal index is part 4.
- **Unit tests:** the Ask instructions are now long enough to be cached (`scripts/test-prompt-cache.mts` updated); a test for removing unsupported lines (`scripts/test-tidy.mts`); tidy, layout, figure and question-rule tests pass; build check passes.

## Decision aids: the owner's second review, and finding them from Admin (November 2026)  *(branch `aids-review-and-extract`)*
From the owner, 4 November 2026: "Reviewed all the other decision aids. Revise it. Also, going forward when I upload more materials to the source, I want the model to automatically extract decision aids ... or alternatively add button", and that Next should go to the next aid that needs review.
Status: **merged and deployed, 4 November 2026,** at the owner's word, with part 4.
- **The eight aids marked "needs changes":** corrected from his notes and put back to Waiting for review, each with a note of what was done: #348 (footnote h in full), #438 (his order, steps 1 to 7), #547 (severely symptomatic fetus to boxes 7 and 8, and a picture that had cut off the right of the chart), #551 (his flow), #553 (one row, the summary advice for the whole table), #554 (the Pacheco ticks), #565 (the high-risk ethnicities, from the RCOG leaflet, as NG3 does not name them). #561, the Maastricht grid, is marked not a decision aid, as he said to if not sure: the chart has only shades of grey and the transcribed grid contradicted its caption. The row is kept.
- **Next** on an aid goes to the next one waiting for review, showing how many are left, and comes round to the first after the last.
- **Finding aids from inside the app (`src/lib/decision-aid-extract.ts`, `/api/decision-aids/search`):** a guideline uploaded for the first time is searched by itself once ingested; every PDF's card has a Find decision aids button for anything else, for looking again, and for carrying on a search that stopped. Same prompts and models as the library's run (`scripts/build-decision-aids.mts` now imports them), no second-model checks. TOG articles, leaflets and summaries are not searched unless asked.
  - The host has no Windows PDF engine, so the page is cut out of the PDF itself with pdf-lib (the small tool the owner approved in October), turned upright and cropped. Tested on GTG 37a's sideways chart: the antenatal chart came back with the same groups as the approved aid. The cut-out is also what the owner checks against, shown as a PDF in the page; only Admin's security policy allows that frame.
  - A function has a time limit, so a search is a chain of short steps, one page read or one aid transcribed, each calling the next with the cron secret. Progress is a small file in Storage (`aids/<id>/search.json`), so no database change was needed. A search stops at EUR 6 or on the model's daily limit, says why on the card, and the button carries on. A reviewed aid is never overwritten.
  - End-to-end test on the local server, on the UKHSA varicella PEP guidance: 10 pages read, 2 tables saved as drafts (#566, #567), EUR 0.20.
- **For the owner:** 87 older sources were never searched (the EUR 40 cap in October), among them BSH sickle cell, thalassaemia and red cell antibodies, BASHH PID and BHIVA. Each now has the button.

## Ask Pinard, part 4: the legal index (November 2026)  *(branch `phase-ask-legal`, on top of `aids-review-and-extract`)*
From the owner's brief, part 4: "Build an index of every law, legal case and piece of professional or regulatory guidance mentioned in the sources, with what each one establishes and where it appears. When a question asks about legal aspects, the assistant identifies all the relevant ones from that index and applies them to the case." From the owner, 4 November 2026: "Once done, move to Part 4 automatically."
Status: **merged and deployed, 4 November 2026,** at the owner's word. The owner ran `supabase/phase52-legal-index.sql` and the 328 entries are loaded as drafts. The owner approved all of them on 5 November 2026, so Ask Pinard now uses them.
- **The index (`scripts/build-legal-index.mts`):** every passage that names an Act, a case, a regulator or a statutory code (about 1,300 of 16,700) was read once and what it says each one establishes was noted; the names were grouped, and each entry written from those notes alone; one look over the whole list merged the same guidance named two ways and dropped clinical guidelines, reports and curricula. 328 entries: 130 laws, 48 cases, 150 professional or regulatory guidance. Law that bears only on property, trusts or court procedure, from the Mental Capacity Act's schedules, is left out.
- **In answers (`src/lib/legal-index.ts`, `src/lib/chat-service.ts`):** the planning step is shown a catalogue of the approved entries and picks up to six. An entry is a guide, not a source: it brings up to eight passages where the law is discussed into the answer, and the answer cites those, so every citation, figure and line check runs as before. The answer is told to apply each law to her on the facts given.
  - A new shape for a legal or professional question: What applies, Applied to this case, What to do.
  - A case that raises a legal point without asking has "the legal position" added to its issues: given the entries alone, the owner's scenario answered everything but that.
  - "The legal position on consent" no longer falls to the counselling shape on the word consent.
- **Admin > Legal index:** the entries by kind; each page shows what it establishes, which the owner can correct directly, and every place it appears; Next goes to the next one waiting, and Approve all approves those left. Only approved entries are used. An entry cannot put a claim into an answer by itself, which is why approving the rest at once is offered here and not for decision aids.
- **Test against the live library (4 November 2026, nothing stored):** eight questions asked of `main` and of the branch with the index from a file: the owner's last scenario, declining blood in labour, a girl under 16 asking for contraception, termination at 30 weeks, consent for a repeat caesarean, an adult lacking capacity, FGM in a 16-year-old, and the narrow aspirin question. All answered on both: 36, 21, 16, 18, 26, 19, 26 and 9 s, against 43, 24, 21, 21, 28, 16, 29 and 12 s on `main`. On `main` the declining blood answer says the Mental Capacity Act and case law are not covered. The narrow question has no legal padding. Side by side for the owner: https://claude.ai/artifact/RNwXwYTo7aa9xo32uH7UzV (private).
- **Faults found on the way:** a batch on Haiku used up the rate limit the live planner shares, and answers lost their plans without any error, so the batch moved to Sonnet 4.5 and the first baseline was thrown away; and groups saved by number pointed at the wrong laws once more notes were added (the FGM offence under the Fines and Recoveries Act), so groups are now kept by name and the entries were rebuilt.
- **Still missing:** the third stage in the owner's scenario. One run in three of that scenario missed the thrombocytopenia guideline, from the planning step's search words, as seen in part 3. New uploads are not added to the index by themselves: it is rebuilt with the script.
- **Cost:** about EUR 16, of which EUR 3.50 was the rebuild after the grouping fault.
- **Where RCOG and NICE differ (owner, 4 November 2026):** "Follow RCOG, however if a NICE guideline has a more recent recommendation, then follow NICE in that situation. Just make sure to highlight that if it is in a question/decision aid/ask pinard query, etc whoever reading it should know there is a discrepancy and have the option to choose which to follow."
  - Rule 7 in prompt G, so it reaches Ask Pinard, follow-up chat and question writing. Passages now show their year (`withYears` in `src/lib/retrieval.ts`), which is what lets the more recent be judged; a reference such as "NICE guideline NG133" does not carry one.
  - Answers carry a "Guidance differs:" line with both positions and years, drawn as a highlighted box (`src/components/AnswerText.tsx`). The line check keeps it if both positions are in the sources, and the figure check accepts the years.
  - A new question avoids testing a point where they differ if it can, and otherwise closes its explanation with the same sentence; the source-naming and length checks do not count that sentence.
  - The two aspirin aids (#563, #564) carry the difference as a footnote, kept approved.
  - Tested: the aspirin question leads with RCOG's 150 mg at night to 36+6 weeks (GTG 31, 2024, against NG133, 2023) and shows the difference; three questions with no difference showed no line. Not yet seen in a real answer: a case where NICE is the more recent.
  - Limits: a question is written from passages that are usually from one guideline, so it can only flag a difference it can see, and the questions and aids already approved have not been searched for differences.

## Ask Pinard, part 5: gynaecology (November 2026)  *(branch `phase-ask-gynae`)*
From the owner's brief, part 5, with the draft order for him to confirm or correct: "presentation and risk factors, red flags, investigations, management (conservative, medical, surgical), risks and complications with figures, follow-up. For surgical cases, cover preoperative, intraoperative and postoperative care." From the owner, 4 November 2026: "run the 30 clinical sources, then move to Part 5".
Status: **merged and deployed, 5 November 2026.** The owner: "New layout is better."
- **The pathways are the decision aids:** the brief's pathway library gave way to the guidelines' own charts and tables at the owner's direction, so gynaecology needs no second library. The clinical sources still unsearched, ESHRE endometriosis and PCOS and BASHH PID among them, have now been searched: 30 sources, 38 aids waiting for the owner's review in Admin, EUR 4.45. Most came from BSH thalassaemia (7), BSH red cell antibodies (6), ESHRE PCOS (6), ESHRE endometriosis (4), extreme preterm birth (4) and perinatal mental health (4). `--budget 15` was also read as document 15, so GTG 17 was read again for EUR 0.35; its ten approved aids were left alone and the script is fixed.
- **The order (prompt A, `src/lib/chat-service.ts`):**
  - shape 4, a gynaecological condition: Presentation and risk factors, Red flags, Investigations, Conservative management, Medical management, Surgical management, Risks and complications, Follow-up (asks 350 words, sent back above 480);
  - shape 9, new, a gynaecological operation: Presentation and risk factors, Preoperative, Intraoperative, Postoperative, Risks and complications, Follow-up (asks 400, sent back above 540);
  - shape 5, a woman presenting: Presentation and risk factors, Red flags only if she has any, Investigations, and stop. Short on purpose: the owner rated the heavy bleeding case a focused question that should give her risks and the scan and leave the rest for a follow-up (10 October 2026).
- **A fault found:** the planner filed most gynaecology under a condition in pregnancy, so "how is endometriosis managed?" opened with "This is not covered in the current source material" and then gave the answer as an aside. A question with no sign of pregnancy can no longer be filed there.
- **Also:** a short question about a whole condition or operation now gets its issue-by-issue search; the line check is told every stage is asked for; a stage whose only line is "not covered" is dropped, and named in the closing line instead.
- **Guidance differs, tightened:** the first run compared NICE with a TOG review written for adolescents. Rule 7 now says an RCOG guideline against a NICE guideline, for the same women; a TOG review is not a guideline.
- **Test against the live library (4 November 2026, nothing stored):** eight questions asked of `main` and of the branch. All answered: 14, 24, 30, 30, 30, 26, 24 and 9 s, against 25, 27, 20, 14, 15, 20, 18 and 10 s on `main`, the longer ones for the issue searches the whole-path questions now get. Side by side for the owner: https://claude.ai/artifact/PB5Q6yGCPfi8JoLH4aY3Ct (private).
- **An aid for the wrong woman:** one run of the heavy bleeding case applied the pathway for bleeding on HRT (#497) to a woman not on HRT. Planning, the answer and the line check are now told an aid written for a group she is not in does not apply, however close its subject. In three runs since, the check removed such lines twice; in the third the planner still offered the HRT aids, and the answer used one for a general fact only.
- **Still to see:** in the heavy bleeding case the answer stops at investigations as the owner wanted, but which ones varies: of three runs, one gave examination and ultrasound, as he expected, and two went to biopsy. Risks with figures are thin for operations: the line check removed lines where a figure was attached to the wrong thing.
- **Unit tests:** two added to `scripts/test-tidy.mts`.

- **Heavy bleeding (owner, 5 November 2026: "Follow the decision aid"):** no aid covered heavy bleeding outside HRT and contraception, because NICE NG88 writes it as a list. Drafted from the guideline's words as #606 for the owner's approval. Recommendation 1.3.12 offers pelvic ultrasound where examination is difficult, for example in women who are obese, so the ultrasound he expected is there. Until it is approved, the case still varies.

## Ask Pinard, part 6: speed (November 2026)  *(branch `phase-ask-speed`)*
From the owner's brief, part 6: stream the answer so the first words appear straight away, run lookups at the same time, cache the fixed instructions, avoid chains of model calls, keep answers tight, and report speed before and after.
Status: **merged and deployed, 5 November 2026,** at the owner's word.
- **Measured first:** a full answer's time is mostly the model writing it, and that goes with its length: about 250 tokens took 5 seconds and 1,500 took 26, with 8,000 to 28,000 tokens read. Planning takes 2 to 4 seconds, the search about 1, the line check 1 to 6. So reading fewer passages would save little and risk coverage, and they stay at 16. What can be changed is how long the candidate sees nothing.
- **Streaming (`/api/ask`, `src/lib/ask-draft.ts`):** the Ask box now gets the answer line by line, as one JSON object a line, in place of a server action that sends nothing until it has finished. Rule 2 of the project says citations are verified before anything is displayed, so each line is held until it has ended, and shown only if everything it cites was given to the model and every figure in it is in the sources. The line-by-line check still runs on the whole answer, which then replaces what is on screen. Until then the text is muted, under "Still being checked: a line may change or go." A second attempt is not shown as it is written.
- **The reply comes as a tool call, and Bedrock held its long string back** until it was complete, so every line arrived at the end together. `eager_input_streaming` on the tool fixes that; a short test had not shown it, a real answer did.
- **The search:** the question's own search now runs while the plan is made, not after it.
- **Caching:** the planner's 25,000-token catalogue is cached and read back. The answer's own instructions are 2,995 tokens, under the model's minimum, so caching does not apply to them.
- **Chains:** planner, answer and line check stay. Each does something the others cannot, and the planner's aids and searches are what the answers rest on.
- **Times, 5 November 2026, first line and whole answer, against the whole wait on `main`:** last rated scenario 8 and 38 s against 36; preconception 8 and 33 against 16; booking 11 and 35 against 28; medical condition 6 and 41 against 38; declining blood in labour 8 and 33 against 38; postpartum after GDM 7 and 19 against 16; legal 6 and 18 against 16; narrow 5 and 9 against 9; gynaecology 6 and 20 against 17. The whole answer takes about as long as before: the preconception case was planned as a full scenario in this run and a shorter layout in the other.
- **A fault found:** the line check removed the headline of the aspirin answer, because the aid gives NICE's dose beside RCOG's and it would not accept the line that followed rule 7. It is now told a line may give either side of a difference. Three runs since: headline kept, difference shown, nothing removed. That fault is on the live site until this is deployed.
- **Limits:** a line that passes the code checks can still be removed by the line check after it has been on screen: 14 lines across the nine test answers, mostly a risk or figure applied to the wrong group, which is why the text stays muted until then. Holding each stage back until it has been checked would avoid this, at the cost of a later first line and more checking calls. The Ask box has not been watched on screen by the developer, who cannot sign in to it.
- **Unit tests:** `scripts/test-ask-draft.mts`.
---

## Admin > Sources: questions by source (November 2026)  *(branch `sources-question-counts`)*
From the owner, 5 November 2026: "add a feature to sources, to show me how many SBA/EMQs are there that belong to each of the sources, it is easier for me to recognize where should I generate more questions from".
Status: **merged and deployed, 5 November 2026,** at the owner's word.
- Each source's card shows its approved SBAs, its approved EMQ sets, and how many are waiting for review. An EMQ set counts once, however many scenarios it has, and a question resting on two documents counts for both. Rejected questions are not counted.
- A new order in the list's filters: newest first, fewest questions first or most questions first. In either question order TOG items join the main list, so the gaps can be seen across everything in the section.
- No database change. `src/lib/source-question-counts.ts`, tested in `scripts/test-source-question-counts.mts`.

---

## After launch — ongoing loop
- Upload new guidance → generate → review → approve. Fresh questions keep subscribers.
- Watch the flagged-verification and user-flag lists weekly.
- Recruit 5–10 colleagues sitting the next diet as free beta testers before charging anyone.
