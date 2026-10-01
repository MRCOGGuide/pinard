/**
 * Rebuild #1740–#1742 on magnitudes rather than hazard ratios.
 *
 *   npx tsx scripts/fix-cardiometabolic-set.mts
 *   npx tsx scripts/fix-cardiometabolic-set.mts --apply
 *
 * Every option in the set was a ratio with its confidence interval —
 * "HR 14.33 (95% CI 9.03–22.70)" against "HR 18.49 (95% CI
 * 17.12–19.96)" — which is a memory test for a decimal, not a test of
 * whether a registrar can counsel a woman at her postnatal visit.
 *
 * The article states the same associations in words, and those are
 * what a clinician says out loud: GDM "double the risk" of hypertension
 * within 10 years, pre-eclampsia a "three-fold increase", recurrent
 * pre-eclampsia "six-fold", post-GDM type 2 diabetes "estimated at
 * 7.43". So the options become magnitudes, the ratios move into the
 * explanations where they belong, and two scenarios move with them:
 * the preterm pre-eclampsia and the GH-plus-GDM figures exist only as
 * decimals, so those scenarios now ask about pre-eclampsia and about
 * GDM, which the article puts in words.
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
  studyAttributionProblems,
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

/** Ordered by size, as the bank orders every list of figures. */
const OPTIONS = [
  { key: "A", text: "No measurable increase" },
  { key: "B", text: "Approximately 1.5 times" },
  { key: "C", text: "Approximately double" },
  { key: "D", text: "Approximately three times" },
  { key: "E", text: "Approximately four times" },
  { key: "F", text: "Approximately six times" },
  { key: "G", text: "Approximately seven times" },
  { key: "H", text: "Approximately ten times" },
  { key: "I", text: "Approximately fifteen times" },
  { key: "J", text: "Approximately twenty times" },
];

const EDITS = [
  {
    id: 1740,
    key: "C",
    stem:
      "A 34-year-old woman attends her 6-week postnatal review following a pregnancy complicated by GDM requiring insulin. She asks how likely she is to need treatment for high blood pressure within 10 years of the birth, compared with women who did not have GDM. What risk figure should she be quoted?",
    explanation:
      "After adjusting for hypertensive disease in pregnancy, women who have had GDM are about twice as likely to need treatment for hypertension within 10 years of the birth (HR 2.43, 95% CI 1.91–3.10). The risk of progressing to type 2 diabetes is higher again in those who needed insulin.",
  },
  {
    id: 1741,
    key: "D",
    stem:
      "A 29-year-old primiparous woman is reviewed at the postnatal clinic 8 weeks after a pregnancy complicated by pre-eclampsia. She asks how likely she is to need treatment for high blood pressure in the years ahead, compared with women whose pregnancies were normotensive. What risk figure should she be quoted?",
    explanation:
      "Pre-eclampsia carries about a three-fold increase in the risk of hypertension in the years after the pregnancy (pooled RR 3.1, 95% CI 2.5–3.9). After a second affected pregnancy the risk is roughly six-fold, and it is higher again where the pre-eclampsia was preterm.",
  },
  {
    id: 1742,
    key: "G",
    stem:
      "A 31-year-old woman attends for counselling following a pregnancy complicated by GDM. Her blood pressure was normal throughout the pregnancy. She asks how her chance of developing type 2 diabetes compares with women who did not have GDM. What risk figure should she be quoted?",
    explanation:
      "The pooled risk of type 2 diabetes after GDM is about seven times that of women without it (RR 7.43, 95% CI 4.79–11.51), and the cumulative incidence is highest in the first three to six years after birth. Where gestational hypertension coexists, the risk is higher again.",
  },
];

for (const e of EDITS) {
  for (const text of [e.stem, e.explanation]) {
    const problems = [
      ...selfTalkProblems(text),
      ...ukEnglishProblems(text),
      ...sourceNarrationProblems(text),
      ...studyAttributionProblems(text),
    ];
    if (problems.length) throw new Error(`#${e.id}: ${problems.join("; ")}`);
  }
  if (!e.stem.trim().endsWith("?")) throw new Error(`#${e.id}: the stem does not ask`);
  const words = e.explanation.split(/\s+/).length;
  if (words > 70) throw new Error(`#${e.id}: explanation is ${words} words`);
  if (!OPTIONS.some((o) => o.key === e.key)) throw new Error(`#${e.id}: no such option`);
}
if (new Set(EDITS.map((e) => e.key)).size !== EDITS.length) {
  throw new Error("two scenarios share an answer");
}

for (const e of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, correct_key, explanations")
    .eq("id", e.id)
    .single();
  if (!row) throw new Error(`#${e.id}: not found`);
  const explanations = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];
  const old = explanations.find((x) => x.key === row.correct_key);
  if (!old) throw new Error(`#${e.id}: no explanation for the answer`);

  console.log(`#${e.id}  ${row.correct_key} -> ${e.key} (${OPTIONS.find((o) => o.key === e.key)?.text})`);
  console.log(`   was: ${(row.stem as string).slice(-150)}`);
  console.log(`   now: ${e.stem.slice(-150)}`);
  console.log(`   why: ${e.explanation}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({
        stem: e.stem,
        options: OPTIONS,
        correct_key: e.key,
        explanations: [{ ...old, key: e.key, text: e.explanation }],
      })
      .eq("id", e.id);
    if (error) throw new Error(`#${e.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
