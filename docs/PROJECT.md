# PINARD — Master Project Brief
### Intelligent MRCOG revision, grounded in the evidence.

This file is the single source of truth for the project. Claude Code: read this file fully before every task. Every decision below is deliberate — follow it exactly unless the owner instructs otherwise.

---

## 1. What Pinard is

Pinard is an AI-powered MRCOG revision platform (web + iOS + Android) for UK obstetrics & gynaecology trainees. It generates exam-style questions and feedback **exclusively** from source material uploaded by the owner, cites every claim, builds an adaptive study plan around each user's exam date, and relentlessly targets weak topics until every sub-topic sits at or above the 70% mark.

The name refers to the Pinard stethoscope — the instrument that listens. The product listens to the user's knowledge, detects what's weak, and responds.

**Audience:** UK O&G trainees (ST1–ST7, core users ST3–ST5) preparing for MRCOG Part 1 (basic sciences SBAs), Part 2 (clinical SBAs + EMQs) and Part 3 (clinical assessment preparation). They are busy, on-call, revising on phones between cases. They are scientifically literate and allergic to fluff, but under real pressure — the tone must be precise, warm and steady.

---

## 2. Non-negotiable product rules

1. **UK English everywhere** — interface, questions, feedback, emails, notifications. UK spellings (anaesthesia, foetal per RCOG house style "fetal" — use *fetal*, *caesarean*, *oestrogen*, *labour*, *haemorrhage*), UK units, UK guidance (NICE/RCOG as uploaded).
2. **Grounding** — the AI answers ONLY from retrieved source passages. Every factual claim carries a citation to a passage ID. If sources don't cover it, the AI says: *"This is not covered in the current source material."* The application verifies every cited passage ID exists in the retrieved set before displaying anything; failed verification = discard and regenerate (max 2 retries, then log for admin review).
3. **Admin review gate** — no generated question reaches users until the owner approves it in the review queue.
4. **The owner-facing admin area and the user-facing app are strictly separated.** Users never see sources management, ingestion, prompts or the review queue.
5. Every screen carries the footer line: *"Pinard is a revision aid, not a source of clinical advice."*

---

## 3. Brand & design system

**Personality:** a calm senior registrar who has read everything — precise, reassuring, quietly confident. Editorial-medical, never clinical-sterile, never gamified-cartoonish.

### Colour tokens
| Token | Hex | Use |
|---|---|---|
| `theatre` | `#0F3D33` | Primary ink — headings, primary buttons, logo |
| `greentop` | `#2F6D5B` | Secondary — links, active states, correct answers |
| `sage` | `#EDF3EE` | App background |
| `porcelain` | `#FDFDFB` | Cards, question surfaces |
| `heartbeat` | `#D64562` | Accent, used sparingly — progress trace, streaks, incorrect answers, key CTAs |
| `graphite` | `#232A27` | Body text |

The deep green deliberately echoes the RCOG Green-top Guidelines that this audience lives by; the rose is the heartbeat accent. Never introduce additional hues without instruction.

### Typography (all free via Google Fonts)
- **Display:** Newsreader (600/700) — headings, question stems, scores. Bookish, journal-like.
- **UI & body:** Albert Sans (400/500/600).
- **Data:** Spline Sans Mono — percentages, countdowns, timers, references.

### Signature element: **the trace**
A fine 1.5px CTG-style line motif in `heartbeat`: it underlines the section header on each screen, and the user's per-topic progress chart is drawn as a running trace toward the 70% target line (a dashed `greentop` rule labelled "70 — pass threshold"). This is Pinard's one memorable visual device; keep everything else quiet and disciplined. On page load the trace draws in over 600ms; respect `prefers-reduced-motion`.

### Layout & feel
Generous whitespace, max content width 720px for question screens (reading comfort), cards with 12px radius and hairline `#DCE5DF` borders, no drop-shadow heavier than 0 1px 3px. Mobile-first: everything must be comfortable one-handed on a phone. Visible keyboard focus states throughout.

### Voice & microcopy
Plain verbs, sentence case, no exclamation marks except in milestone celebrations. Buttons say what they do: "Check answer", "Show explanation", "Start today's session". The countdown reads "**94 days** to Part 2". Empty states invite action: "No sessions yet today. Your plan suggests *Maternal medicine* — 12 questions, about 15 minutes."

---

## 4. Pricing (GBP, VAT-inclusive)

| Tier | Price | Notes |
|---|---|---|
| **Free** | £0 | 3 sample questions per section with one full worked feedback each; diagnostic locked |
| **Monthly** | £16.99/month | Flexible |
| **Quarterly** | £39.99 (£13.33/mo) | **Most popular** — matches a typical 10–14-week revision cycle; pre-select this |
| **Annual** | £99.99 | For trainees spanning two sittings or parts |

7-day full refund window, no questions asked (state it plainly — it converts). Launch offer: "Founding member — 30% off your first cycle" for the first 500 subscribers. Stripe on web; Apple/Google in-app purchases via RevenueCat on mobile at the same price points.

---

## 5. Technology stack

- **Next.js 14 (App Router) + TypeScript + Tailwind** — web app and admin
- **Supabase** — Postgres, Auth (email/password + magic link), Storage, pgvector, Edge Functions, cron
- **Anthropic API** — `claude-sonnet-4-6` for generation/feedback/chat; JSON-structured outputs
- **Voyage AI** — embeddings (`voyage-3` family) for chunks and queries
- **Resend** — transactional email and daily plan reminders
- **Stripe** (web) + **RevenueCat** (mobile IAP)
- **Capacitor** — iOS/Android wrappers + push notifications
- **Vercel** — hosting + cron

All API keys live in environment variables server-side only. AI calls happen exclusively in server routes/edge functions — never from the browser.

---

## 6. Database schema (Supabase / Postgres)

- `profiles` — user id, name, role (`admin`|`user`), exam (`part1`|`part2`|`part3`), exam_date, created_at
- `sections` — id, exam, title, parent_id (nullable, for sub-topics), sort_order, is_active
- `content_documents` — id, section_id, title, source_reference (e.g. "RCOG GTG No. 37a, 2015"), source_year, file_url, status, uploaded_at
- `content_chunks` — id, document_id, section_id, chunk_index, text, embedding vector(1024), token_count
- `key_facts` — id, chunk_id, section_id, subject, fact_type (e.g. `risk`, `incidence`, `dose`, `threshold`, `sensitivity`), value_numeric, value_text, statement, source_reference  ← powers "Similar Values"
- `example_questions` — id, section_id, format (`sba`|`emq`), stem, options jsonb, correct_key, rationale, source_note
- `generated_questions` — id, section_id, format, stem, options jsonb, correct_key, explanations jsonb (per option, each with citation ids), difficulty (1–5), citation_chunk_ids int[], status (`pending`|`approved`|`rejected`), created_at, reviewed_at
- `user_answers` — id, user_id, question_id, chosen_key, is_correct, seconds_taken, session_id, answered_at
- `user_topic_performance` — user_id, section_id, rolling_accuracy, attempts, last_practised_at, mastery (`weak`|`developing`|`secure`)
- `study_plans` — id, user_id, generated_at, plan jsonb (weeks → days → section_ids + question targets), narrative text
- `chat_messages` — id, user_id, question_id, role, content, created_at (follow-up tutor chat, scoped per question)
- `subscriptions` — user_id, provider (`stripe`|`apple`|`google`), status, tier, current_period_end
- `notifications_log` — user_id, type, sent_at

Row-level security ON everywhere: users read/write only their own rows; `admin` role required for all content, example, review and section tables.

---

## 7. Feature specification

### Admin (owner only, `/admin`)
1. **Sections manager** — create/edit/reorder exams, sections, sub-topics; toggle active.
2. **Source library** — upload PDF or paste text; must supply title + source reference + year; ingestion pipeline chunks (600–800 tokens, 15% overlap), embeds via Voyage, extracts key facts (see prompt K in AI-PROMPTS.md), stores everything; shows chunk count and ingestion status per document.
3. **Example questions** — add/edit SBA and EMQ exemplars per section; these are style templates only, never shown to users.
4. **Generation console** — pick section + format + count → queue generation jobs.
5. **Review queue** — card per pending question showing stem, options, per-option explanations, citations (click to view source passage), difficulty; Approve / Edit / Reject. Keyboard shortcuts A/E/R.
6. **Dashboard** — users, subscriptions, questions by status, flagged verification failures.

### User app
1. **Free sampler** — 3 approved questions per section, one full feedback each, then paywall with pricing table.
2. **Onboarding** — choose exam part → set exam date → live countdown begins.
3. **Diagnostic screen** — 5–10 approved questions per active section, balanced difficulty; results write `user_topic_performance`; ends with a topic map: trace chart of every section against the 70% line.
4. **Study plan** — deterministic algorithm (no AI needed for the maths): distribute remaining days across syllabus, front-loading `weak` topics, guaranteeing full coverage, inserting spaced-repetition revisits of secured topics every 7–10 days, tapering to mixed mock papers in the final fortnight. Claude writes only the human-readable narrative (prompt P). Plan re-generates automatically whenever performance data shifts materially or the exam date changes.
5. **Daily session** — "Start today's session" serves the plan's questions; weighting: sections below 70% get selection weight proportional to (70 − accuracy); above 70% enter spaced review.
6. **Free revision mode** — browse any section and practise off-plan; still feeds performance data.
7. **Feedback screen (per question)** — result banner; correct answer; per-option explanation (why right / why wrong), each line citing its source reference; **Similar Values** panel: query `key_facts` for other facts sharing the same value (e.g. everything else that is "7%") and render as memory pairs with citations; follow-up chat box ("Ask Pinard about this question") using prompt C.
8. **Progress** — trace chart per section vs the 70% line, overall readiness estimate, streak, questions answered.
9. **Reminders** — daily push (mobile) + email (web) at user-chosen time: today's topics, question target, minutes estimate. Content from prompt M tone bands.
10. **Motivation** — milestone messages (diagnostic done, first topic secured, 50% syllabus, streaks) and exam-proximity tone shifts per prompt M. Never guilt-tripping; a missed day gets "Pick up where you left off — 15 minutes today keeps the plan on track."

### Verification layer (server-side, every AI response)
Parse JSON → check every `citation_chunk_ids` entry ∈ retrieved set → check every option has an explanation → check UK-English lint list (americanisms: "labor", "cesarean", "estrogen", "anesthesia", "counseling", "fetus/foetus" per house style) → on failure: regenerate (≤2), then flag to admin. Log all failures.

---

## 8. Build order

Follow BUILD-PHASES.md, one phase at a time, committing to Git after each working feature. Do not start a phase until the previous one runs.
