/**
 * Asks Pinard again every question the owner has tested in Admin > Ask
 * Pinard, and reports what changed (owner's request, 10 October 2026).
 *
 *   npx tsx --conditions=react-server scripts/eval-ask.mts            # every rated question
 *   npx tsx --conditions=react-server scripts/eval-ask.mts --faults   # only Needs work and Wrong
 *   npx tsx --conditions=react-server scripts/eval-ask.mts --list     # print the ratings, ask nothing
 *
 * Read-only: nothing is written to the database. Each question costs
 * about 11 cents. For each one it prints the time, whether the checks
 * sent a draft back, whether it answered at all, and, for anything the
 * owner marked down, the new answer beside their note and what it should
 * have said, so the change can be judged against their verdict.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { answerFromLibrary } = await import("../src/lib/chat-service");
const { stripCitations } = await import("../src/lib/chat");

type Review = {
  id: number;
  question: string;
  reply: string | null;
  rating: string | null;
  note: string | null;
  expected: string | null;
  total_ms: number | null;
  ok: boolean;
  passages: { title: string; similarity: number }[];
};

const admin = createAdminClient();
const { data, error } = await admin.from("ask_reviews").select("*").not("rating", "is", null).order("id");
if (error) throw new Error(error.message);
let reviews = (data ?? []) as Review[];
if (process.argv.includes("--faults")) reviews = reviews.filter((r) => r.rating !== "good");

const line = (s: string | null, n = 400) => (s ?? "").replace(/\s+/g, " ").slice(0, n);

if (process.argv.includes("--list")) {
  for (const r of reviews) {
    console.log(`\n#${r.id} [${r.rating}] ${r.question}`);
    console.log(`  answer:   ${line(r.reply ? stripCitations(r.reply) : "(none)")}`);
    if (r.note) console.log(`  note:     ${line(r.note)}`);
    if (r.expected) console.log(`  expected: ${line(r.expected)}`);
    console.log(`  search:   ${r.passages.slice(0, 5).map((p) => `${p.title} (${p.similarity})`).join("; ")}`);
  }
  process.exit(0);
}

let answered = 0;
let slow = 0;
const times: number[] = [];
for (const r of reviews) {
  const trace = { retrievalMs: 0, modelMs: [] as number[], problems: [] as string[][], passages: [] as never[] };
  const t0 = Date.now();
  const out = await answerFromLibrary({ history: [], message: r.question, trace });
  const ms = Date.now() - t0;
  times.push(ms);
  if (out.ok) answered += 1;
  if (ms > 10_000) slow += 1;
  console.log(`\n#${r.id} [was ${r.rating}] ${(ms / 1000).toFixed(1)} s (was ${r.total_ms ? (r.total_ms / 1000).toFixed(1) : "–"} s), drafts sent back ${trace.problems.length}, ${out.ok ? "answered" : `no answer: ${out.reason}`}`);
  console.log(`  ${r.question}`);
  if (r.rating !== "good") {
    console.log(`  new:      ${line(out.ok ? stripCitations(out.reply) : "(none)", 600)}`);
    if (r.note) console.log(`  note:     ${line(r.note)}`);
    if (r.expected) console.log(`  expected: ${line(r.expected)}`);
  }
}
times.sort((a, b) => a - b);
console.log(`\n${reviews.length} asked: ${answered} answered, median ${((times[Math.floor(times.length / 2)] ?? 0) / 1000).toFixed(1)} s, ${slow} over 10 s. About €${(reviews.length * 0.11).toFixed(2)} of AI.`);
