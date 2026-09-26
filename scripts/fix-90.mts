/**
 * Rebuild #90 on what the guideline actually says.
 *
 *   npx tsx scripts/fix-90.mts
 *   npx tsx scripts/fix-90.mts --apply
 *
 * As written it called the pregnancy trichorionic and then asked about
 * reducing a dichorionic triplet, and its answer — intrafetal laser —
 * was supported by nothing in the library except the title of
 * reference 106 in two bibliographies.
 *
 * The guideline does address the medicine underneath it, in prose:
 * "Selective termination in a monochorionic pregnancy is an option,
 * but as the fetal circulations are not independent, it cannot be
 * performed with injection of medical therapeutics because of the
 * effect on the co-twin. More invasive and higher risk procedures,
 * such as cord coagulation, and intrafetal ablative procedures, such
 * as radiofrequency ablation, are necessary…", and elsewhere that this
 * belongs in a centre with expertise in the procedure.
 *
 * So the question is asked from there instead: a shared circulation is
 * why an injected agent cannot be used, which is the point worth
 * knowing and is one a candidate can reason to. The options change
 * with it — they were built around the old answer — leaving one
 * occlusive technique against distractors that are each a real
 * procedure in the wrong place.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems, studyAttributionProblems } =
  await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 32-year-old woman is referred to the fetal medicine unit at 20 weeks of gestation with a monochorionic diamniotic twin pregnancy. Detailed ultrasound shows a severe structural abnormality affecting one twin only; the co-twin is normally grown with normal Dopplers. After counselling she requests selective termination of the affected twin. Which of the following is the most appropriate intervention?";

/* Alphabetical, as the bank orders every option list. */
const OPTIONS = [
  { key: "A", text: "Amnioreduction of the affected twin's sac" },
  { key: "B", text: "Expectant management with fortnightly ultrasound surveillance" },
  { key: "C", text: "Fetoscopic laser ablation of the placental anastomoses" },
  { key: "D", text: "Intracardiac potassium chloride injection into the affected twin" },
  { key: "E", text: "Selective termination using a vaso-occlusive technique in a tertiary centre" },
];
const CORRECT = "E";

const EXPLANATION =
  "The fetal circulations in a monochorionic pair are not independent, so an injected agent reaches the co-twin and selective termination cannot be performed that way. Cord coagulation, or an intrafetal ablative technique such as radiofrequency ablation, is needed instead, and the procedure belongs in a centre experienced in performing it.";

/*
  The guideline prose this rests on: why an injected agent cannot be
  used, the phrase "vaso-occlusive techniques" and the two it names,
  and the requirement for a centre with expertise.

  The answer names the technique the way the guideline does. Naming
  bipolar cord occlusion alone failed the grounding check, and
  correctly: the guideline gives cord occlusion and radiofrequency
  ablation together and ranks neither, so an option that picks one
  claims something the source does not say.
*/
const CITES = [20543, 20535, 20521];

const { data: row } = await db
  .from("generated_questions")
  .select("id, stem, options, correct_key, explanations, status")
  .eq("id", 90)
  .single();
if (!row) throw new Error("no question 90");

for (const text of [STEM, EXPLANATION, ...OPTIONS.map((o) => o.text)]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...studyAttributionProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const words = EXPLANATION.split(/\s+/).length;
if (words < 30 || words > 60) throw new Error(`explanation is ${words} words`);
if (!OPTIONS.some((o) => o.key === CORRECT)) throw new Error("the answer names no option");

const sorted = [...OPTIONS].sort((a, b) => a.text.localeCompare(b.text));
if (sorted.map((o) => o.key).join("") !== OPTIONS.map((o) => o.key).join("")) {
  throw new Error("options are not in alphabetical order");
}

const existing = (row.explanations ?? []) as {
  key: string;
  text: string;
  verdict?: string;
  source_reference?: string;
  citation_chunk_ids?: number[];
}[];
const template = existing[0] ?? {};

console.log(`status: ${row.status} -> approved`);
console.log(`was: ${row.stem}\n`);
console.log(`now: ${STEM}\n`);
for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}${o.key === CORRECT ? "   <== correct" : ""}`);
console.log(`\nnow: ${EXPLANATION}`);
console.log(`cites: ${CITES.join(", ")}`);

if (!apply) {
  console.log("\nnot saved — pass --apply");
  process.exit(0);
}

const { error } = await db
  .from("generated_questions")
  .update({
    stem: STEM,
    options: OPTIONS,
    correct_key: CORRECT,
    explanations: [
      {
        ...template,
        key: CORRECT,
        verdict: "correct",
        text: EXPLANATION,
        citation_chunk_ids: CITES,
        source_reference: "RCOG GTG No. 51",
      },
    ],
    citation_chunk_ids: CITES,
    source_document_ids: [39],
    status: "approved",
  })
  .eq("id", 90);
if (error) throw error;
console.log("\nsaved");
