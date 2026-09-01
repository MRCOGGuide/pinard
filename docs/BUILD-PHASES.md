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

## After launch — ongoing loop
- Upload new guidance → generate → review → approve. Fresh questions keep subscribers.
- Watch the flagged-verification and user-flag lists weekly.
- Recruit 5–10 colleagues sitting the next diet as free beta testers before charging anyone.
