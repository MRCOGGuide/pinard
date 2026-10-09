/**
 * Questions that echo a style example (Phase 11, intellectual property).
 *
 *   npx tsx --conditions=react-server scripts/audit-example-similarity.mts [--pending] [--all-scores]
 *
 * Read-only. Compares every question in the bank (or the pending queue
 * with --pending) with the style examples, using the same measure the
 * generator applies before it stores a question (src/lib/exampleSimilarity):
 * runs of meaningful words shared with ONE example, boilerplate runs
 * excluded. Lists anything over the threshold with the example beside
 * it, and with --all-scores the spread of scores, which is how the
 * threshold was chosen.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");
const sim = await import("../src/lib/exampleSimilarity");

const pendingOnly = process.argv.includes("--pending");
const allScores = process.argv.includes("--all-scores");
const db = createAdminClient();

type Example = { id: number; stem: string; lead_in: string | null; rationale: string | null };
type Question = {
  id: number;
  status: string;
  stem: string | null;
  lead_in: string | null;
  explanation: string | null;
  explanations: { text?: string | null }[] | null;
};

const examples = await fetchAll<Example>((from, to) =>
  db.from("example_questions").select("id, stem, lead_in, rationale").range(from, to)
);
const stemIndex = sim.buildExampleIndex(
  examples.map((e) => ({ id: e.id, text: `${e.lead_in ?? ""} ${e.stem}` }))
);
const explanationIndex = sim.buildExampleIndex(
  examples.filter((e) => e.rationale).map((e) => ({ id: e.id, text: e.rationale! }))
);
const byId = new Map(examples.map((e) => [e.id, e]));

const questions = await fetchAll<Question>((from, to) => {
  let q = db
    .from("generated_questions")
    .select("id, status, stem, lead_in, explanation, explanations")
    .in("status", pendingOnly ? ["pending"] : ["pending", "approved"]);
  return q.order("id").range(from, to);
});

const buckets = new Map<string, number>();
const hits: { q: Question; part: string; c: ReturnType<typeof sim.closestExample> }[] = [];
for (const q of questions) {
  const text = sim.questionText(q);
  for (const [part, c] of [
    ["stem", sim.closestExample(text.stem, stemIndex)],
    ["explanation", sim.closestExample(text.explanation, explanationIndex)],
  ] as const) {
    const band = c.shared === 0 ? "0" : `${Math.min(9, c.shared)}${c.shared >= 9 ? "+" : ""} runs, ${Math.floor(c.share * 10) * 10}%+`;
    buckets.set(`${part}: ${band}`, (buckets.get(`${part}: ${band}`) ?? 0) + 1);
    if (sim.tooClose(c)) hits.push({ q, part, c });
  }
}

console.log(`${questions.length} question(s) against ${examples.length} example(s); threshold ${sim.SIMILAR_MIN_SHARED} runs and ${sim.SIMILAR_MIN_SHARE * 100}%`);
if (allScores) {
  for (const [k, n] of [...buckets].sort()) console.log(`  ${k.padEnd(34)} ${n}`);
}
console.log(`${hits.length} too close`);
for (const { q, part, c } of hits) {
  const ex = byId.get(c.exampleId!);
  console.log(`\n#${q.id} (${q.status}) ${part}: ${c.shared} runs, ${Math.round(c.share * 100)}% shared with example ${c.exampleId}`);
  console.log(`  question: ${(part === "stem" ? sim.questionText(q).stem : sim.questionText(q).explanation).slice(0, 300)}`);
  console.log(`  example:  ${(part === "stem" ? `${ex?.lead_in ?? ""} ${ex?.stem}` : ex?.rationale ?? "").slice(0, 300)}`);
}
