/**
 * #1974 had a woman on magnesium three days after delivery.
 *
 *   npx tsx scripts/fix-1974.mts
 *   npx tsx scripts/fix-1974.mts --apply
 *
 * The question is about halving the maintenance infusion when the
 * kidneys are failing, which is sound and well sourced. The scenario
 * was not: "3 days postpartum following an emergency CS for severe
 * pre-eclampsia ... on a magnesium sulphate infusion running at
 * 1 g/hour". Pre-eclampsia improves after delivery and the infusion is
 * a 24-hour course, so by day 3 there is nothing left to adjust.
 *
 * NICE gives the course exactly: "A loading dose of 4 g should be given
 * intravenously over 5 to 15 minutes, followed by an infusion of
 * 1 g/hour maintained for 24 hours. If the woman has had an eclamptic
 * fit, the infusion should be continued for 24 hours after the last
 * fit."
 *
 * So she is now 12 hours after the caesarean section, inside the
 * course, with the oliguria and the creatinine that make the question
 * live. The explanation states the course first, because a candidate
 * who does not know it is 24 hours long cannot tell a dose adjustment
 * from a drug that should have been stopped yesterday, which is the
 * mistake the old stem taught.
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
const {
  selfTalkProblems,
  ukEnglishProblems,
  sourceNarrationProblems,
  emDashProblems,
  explanationLengthProblems,
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 32-year-old woman is 12 hours after an emergency CS for severe pre-eclampsia and is receiving magnesium sulphate at 1 g/hour for seizure prophylaxis. Her blood pressure is 158/104 mmHg, her urine output has fallen to 15 ml/hour and her serum creatinine is 98 micromol/l. She has no clinical features of magnesium toxicity. What adjustment should be made to her magnesium sulphate?";

const EXPLANATION =
  "The Collaborative Eclampsia Trial regimen is 4 g intravenously over 5 to 15 minutes followed by 1 g/hour maintained for 24 hours, or for 24 hours after the last fit, so this is a course that ends rather than an infusion that runs on. Magnesium is renally excreted, and within that course a urine output below 20 ml/hour or a creatinine above 90 micromol/l calls for the maintenance infusion to be halved to 0.5 g/hour. The 4 g loading dose is still given in full in severe pre-eclampsia or eclampsia whatever the renal function. Serum magnesium is then checked every four to six hours, aiming at 2–3.5 mmol/l.";

const GROUNDS = [
  "if the urine output falls to below 20 ml/hour, or if the creatinine is higher than 90 micromol/l, a 50% dose reduction in magnesium sulphate infusion should be considered from 1 g/hour to 0.5 g/hour",
  "in severe pre-eclampsia or eclampsia, the usual loading bolus dose of 4 g is given",
  "monitoring of the serum magnesium level should be undertaken every four to six hours",
  "a level of 2–3.5 mmol/l is advised",
  "followed by an infusion of 1 g/hour maintained for 24 hours",
  "the infusion should be continued for 24 hours after the last fit",
];

/* NICE NG133, which gives the course the old scenario had outrun. */
const ADD_CITES = [20619];
const ADD_DOCS = [37];

for (const text of [STEM, EXPLANATION]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const long = explanationLengthProblems(EXPLANATION);
if (long.length) throw new Error(long.join("; "));

/*
  The scenario must sit inside the 24 hours the regimen runs for, or
  the question asks about a drug that should already have stopped.
*/
const hours = STEM.match(/(\d+)\s*(hours?|days?)\s+after/i);
if (!hours) throw new Error("the stem no longer says how long after delivery she is");
const since = /day/i.test(hours[2]) ? Number(hours[1]) * 24 : Number(hours[1]);
if (since >= 24) throw new Error(`${since} hours after delivery is past the 24-hour course`);

const { data: row } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids, source_document_ids")
  .eq("id", 1974)
  .single();
if (!row) throw new Error("no question 1974");

const answer = ((row.options ?? []) as { key: string; text: string }[]).find(
  (o) => o.key === row.correct_key
);
if (answer?.text !== "Reduce magnesium sulphate infusion to 0.5 g/hour") {
  throw new Error(`answer has moved: ${answer?.text}`);
}

const cites = new Set<number>([...((row.citation_chunk_ids ?? []) as number[]), ...ADD_CITES]);
for (const e of (row.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
  for (const id of e.citation_chunk_ids ?? []) cites.add(id);
}
const { data: chunks, error: chunkError } = await db
  .from("content_chunks")
  .select("id, text")
  .in("id", [...cites]);
if (chunkError) throw chunkError;
const passage = (chunks ?? [])
  .map((c) => (c.text as string) ?? "")
  .join("\n")
  .replace(/\s+/g, " ");
for (const quote of GROUNDS) {
  if (!passage.includes(quote)) {
    throw new Error(`the passages do not contain "${quote.slice(0, 70)}"`);
  }
}

const explanations = ((row.explanations ?? []) as {
  key: string;
  text: string;
  citation_chunk_ids?: number[];
}[]).map((e) => {
  if (e.key !== row.correct_key) return e;
  const own = (e.citation_chunk_ids ?? []).slice();
  for (const id of ADD_CITES) if (!own.includes(id)) own.push(id);
  return { ...e, text: EXPLANATION, citation_chunk_ids: own.sort((a, b) => a - b) };
});

const rowCites = ((row.citation_chunk_ids ?? []) as number[]).slice();
for (const id of ADD_CITES) if (!rowCites.includes(id)) rowCites.push(id);
const docs = ((row.source_document_ids ?? []) as number[]).slice();
for (const id of ADD_DOCS) if (!docs.includes(id)) docs.push(id);

console.log(`#1974 ${row.status}  answer ${row.correct_key} unchanged (${answer.text})`);
console.log(`   was: ${row.stem as string}\n`);
console.log(`   now: ${STEM}`);
console.log(`   ${(row.stem as string).split(/\s+/).length} -> ${STEM.split(/\s+/).length} words, ${since} hours after delivery`);
console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
console.log(`   cites -> ${rowCites.sort((a, b) => a - b).join(", ")}`);

if (apply) {
  const { error } = await db
    .from("generated_questions")
    .update({
      stem: STEM,
      explanations,
      citation_chunk_ids: rowCites.sort((a, b) => a - b),
      source_document_ids: docs.sort((a, b) => a - b),
    })
    .eq("id", 1974);
  if (error) throw error;
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
