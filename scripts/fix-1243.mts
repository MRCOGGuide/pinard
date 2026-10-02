/**
 * #1243 quoted a live birth rate the current edition has replaced.
 *
 *   npx tsx scripts/fix-1243.mts
 *   npx tsx scripts/fix-1243.mts --apply
 *
 * It asked for "the live birth rate per embryo transfer using frozen
 * stored eggs in the UK (2014–2016 HFEA data)" and answered 19%. The
 * 2026 edition drops that figure for a larger and more useful one:
 * "In this UK study of 3328 elective vitrification cycles in 2280
 * patients, the return rate to use oocytes was 14% with a 36.4% live
 * birth rate."
 *
 * So the question asks what a woman returning for her eggs should be
 * told, and the options are the figures that sit around it in the same
 * passage — the 14% who come back, and the cumulative rates of 42.8%
 * and 25.2% for ten eggs stored under and over 36. The old 19% stays
 * as a distractor: it is the figure anyone who learned this before
 * will reach for.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 37-year-old woman who stored eggs three years ago returns to the fertility clinic wanting to use them. She asks how likely she is to have a baby. According to current RCOG guidance on elective egg freezing, what live birth rate is reported in the UK series of elective vitrification cycles?";

const OPTIONS = [
  { key: "A", text: "14%" },
  { key: "B", text: "19%" },
  { key: "C", text: "25%" },
  { key: "D", text: "36%" },
  { key: "E", text: "43%" },
];
const ANSWER = "D";

const EXPLANATION =
  "A UK series of 3328 elective vitrification cycles in 2280 patients reported a 36.4% live birth rate, with only 14% of patients returning to use their eggs. Storing 10 eggs gives a cumulative live birth rate of 42.8%, falling to 25.2% where the eggs were stored at 36 years or over. An earlier figure of 19% per embryo transfer is out of date.";

/* The passage carrying the series, and the one carrying the cumulative
   rates in the same edition. */
const CITES = [21717, 21718];

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, options, explanations")
  .eq("id", 1243)
  .single();
if (!row) throw new Error("no question 1243");

for (const text of [STEM, EXPLANATION]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
if (!OPTIONS.some((o) => o.key === ANSWER)) throw new Error("the answer names no option");
const words = EXPLANATION.split(/\s+/).length;
if (words > 75) throw new Error(`explanation is ${words} words`);

const explanations = (row.explanations ?? []) as { key: string; text: string }[];

console.log(`was: ${row.stem}\n`);
console.log(`now: ${STEM}\n`);
for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}${o.key === ANSWER ? "   <== correct" : ""}`);
console.log(`\nnow: ${EXPLANATION}`);

if (!apply) {
  console.log("\nnot saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({
    stem: STEM,
    options: OPTIONS,
    correct_key: ANSWER,
    explanations: explanations.map((e) =>
      e.key === row.correct_key
        ? { ...e, key: ANSWER, text: EXPLANATION, citation_chunk_ids: CITES }
        : e
    ),
    citation_chunk_ids: CITES,
    source_document_ids: [1006],
  })
  .eq("id", 1243);
if (error) throw error;
console.log("\nsaved");
