/**
 * #1164 asked which body said what. Ask what RCOG says.
 *
 *   npx tsx scripts/fix-1164.mts
 *   npx tsx scripts/fix-1164.mts --apply
 *
 * It read "According to ESHRE guidance, which of the following
 * treatment regimens is recommended for her next pregnancy?", with the
 * RCOG and ASRM regimens as the distractors. Strip the attribution and
 * it had no single answer; keep it and the question turns on which
 * college published which, not on what to do for the woman.
 *
 * The bank follows RCOG where RCOG has guidance, and Green-top 17 is
 * plain: "Aspirin and heparin (unfractionated heparin [UFH] or LMWH)
 * should be offered to women with APS (e.g. 75 mg aspirin orally and
 * 40 mg subcutaneously enoxaparin from a positive pregnancy test until
 * at least 34 weeks of gestation)."
 *
 * So the question asks what she should be offered, the answer is that
 * regimen, and ESHRE's preconception aspirin becomes the distractor it
 * ought to have been.
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
  "A 38-year-old woman, G3P0, attends the recurrent pregnancy loss clinic following her third consecutive first-trimester miscarriage. Antiphospholipid syndrome (APS) is confirmed on two occasions 12 weeks apart. She is currently not pregnant but wishes to conceive soon. What should she be offered for her next pregnancy?";

/* Alphabetical, as the bank orders every list. */
const OPTIONS = [
  { key: "A", text: "Low-dose aspirin alone, from the first positive pregnancy test" },
  {
    key: "B",
    text: "Low-dose aspirin and heparin, from the first positive pregnancy test until at least 34 weeks",
  },
  {
    key: "C",
    text: "Low-dose aspirin from preconception, with heparin from the first positive pregnancy test",
  },
  {
    key: "D",
    text: "No pharmacological treatment; supportive care only in a dedicated early pregnancy assessment unit (EPAU)",
  },
  { key: "E", text: "Prophylactic heparin alone, from the first positive pregnancy test" },
];
const ANSWER = "B";

const EXPLANATION =
  "In antiphospholipid syndrome, aspirin and heparin are offered together from a positive pregnancy test until at least 34 weeks — 75 mg aspirin orally with 40 mg subcutaneous enoxaparin, or unfractionated heparin. Aspirin is not started preconception, and neither drug is offered for unexplained recurrent miscarriage.";

/* The recommendation, and the paragraph that gives the regimen. */
const CITES = [3822, 3850];

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, options, explanations")
  .eq("id", 1164)
  .single();
if (!row) throw new Error("no question 1164");

for (const text of [STEM, EXPLANATION, ...OPTIONS.map((o) => o.text)]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const sorted = [...OPTIONS].sort((a, b) => a.text.localeCompare(b.text));
if (sorted.map((o) => o.key).join("") !== OPTIONS.map((o) => o.key).join("")) {
  throw new Error("options are not in alphabetical order");
}
const words = EXPLANATION.split(/\s+/).length;
if (words > 70) throw new Error(`explanation is ${words} words`);

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
    source_document_ids: [15],
  })
  .eq("id", 1164);
if (error) throw error;
console.log("\nsaved");
