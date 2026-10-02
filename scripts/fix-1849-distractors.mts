/**
 * Build #1849's distractors out of its answer.
 *
 *   npx tsx scripts/fix-1849-distractors.mts
 *   npx tsx scripts/fix-1849-distractors.mts --apply
 *
 * The set asked what antibiotic prophylaxis a woman in preterm labour
 * should have, and the list offered one antibiotic and "withhold". The
 * other options were tocolytics, magnesium, resuscitation decisions and
 * counselling figures, so the candidate was down to two without
 * knowing anything.
 *
 * A distractor is worth having when it is the answer with one thing
 * changed. Here that is the drug and the trigger: benzylpenicillin
 * against co-amoxiclav and clindamycin, and once labour is established
 * against only on rupture of membranes or only if chorioamnionitis is
 * suspected. Oral erythromycin for ten days joins them because it is
 * the right answer to the neighbouring question, prelabour rupture of
 * membranes, which is exactly the confusion worth testing.
 *
 * The library gives no dose for benzylpenicillin, so the options do not
 * invent one. Where a dose is stated, the dose is the axis to vary.
 *
 * #1850 gains the same treatment: its answer is 23% after classical CS,
 * and the same study gives 12% after a lower transverse or vertical
 * incision, which belongs in the list beside 3.5% for vaginal birth.
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
const { selfTalkProblems, ukEnglishProblems, emDashProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const GROUP = "7ba95e80-967f-4bbd-9f4c-87933a69de6b";

const TEXTS = [
  "Administer peripartum magnesium sulphate infusion",
  "Consider nifedipine as tocolysis",
  "Counsel that serious maternal complications occur in approximately 3.5% after vaginal birth at 23-27 weeks",
  "Counsel that serious maternal complications occur in approximately 12% after lower transverse or vertical incision CS",
  "Counsel that serious maternal complications occur in approximately 23% after classical CS",
  "Intravenous benzylpenicillin once labour is established",
  "Intravenous benzylpenicillin only if chorioamnionitis is suspected",
  "Intravenous benzylpenicillin only if the membranes rupture",
  "Intravenous clindamycin once labour is established",
  "Intravenous co-amoxiclav once labour is established",
  "Offer atosiban as tocolysis",
  "Offer nifedipine as tocolysis",
  "Oral erythromycin 250 mg four times daily for 10 days",
  "Proceed to active resuscitation",
  "Withhold active resuscitation",
  "Withhold intrapartum antibiotic prophylaxis",
];

/* Keys follow the order, so the list cannot drift out of it. */
const OPTIONS = [...TEXTS]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

const ANSWERS: Record<number, string> = {
  1848: "Consider nifedipine as tocolysis",
  1849: "Intravenous benzylpenicillin once labour is established",
  1850: "Counsel that serious maternal complications occur in approximately 23% after classical CS",
};

for (const o of OPTIONS) {
  const problems = [
    ...selfTalkProblems(o.text),
    ...ukEnglishProblems(o.text),
    ...emDashProblems(o.text),
  ];
  if (problems.length) throw new Error(`${o.key}: ${problems.join("; ")}`);
}

/* The answer must not be the longest of the options it competes with. */
const antibiotics = OPTIONS.filter((o) => /penicillin|clindamycin|co-amoxiclav|erythromycin|antibiotic/i.test(o.text));
const longest = [...antibiotics].sort((a, b) => b.text.length - a.text.length)[0];
if (longest.text === ANSWERS[1849]) {
  throw new Error("the answer is the longest of the antibiotic options");
}

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options, explanations")
  .eq("emq_group_id", GROUP)
  .order("id");
if (!rows?.length) throw new Error("set not found");

for (const row of rows) {
  const wanted = ANSWERS[row.id];
  if (!wanted) throw new Error(`#${row.id}: no answer mapped`);
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);
  const explanations = (row.explanations ?? []) as { key: string; text: string }[];

  console.log(`#${row.id}  ${row.correct_key} -> ${next.key}  ${next.text}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({
        options: OPTIONS,
        correct_key: next.key,
        explanations: explanations.map((e) =>
          e.key === row.correct_key ? { ...e, key: next.key } : e
        ),
      })
      .eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
