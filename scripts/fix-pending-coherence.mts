/**
 * Two pending scenarios asked for a plan they had already passed.
 *
 *   npx tsx scripts/fix-pending-coherence.mts
 *   npx tsx scripts/fix-pending-coherence.mts --apply
 *
 * #1861 put a woman at her 20-week anomaly scan, with her cervical
 * length already measured, and asked what screening the evidence
 * supports "going forward" — answer: cervical length measurement from
 * 18 weeks. Two weeks too late to start, and the stem's "going
 * forward" points instead at the option it is designed to reject,
 * repeated serial measurements. She is seen at 16 weeks now, and the
 * measurement she has not had yet comes out.
 *
 * #1887 asked at what gestation serial growth surveillance should
 * commence, of a woman already 34 weeks pregnant. The threshold is 28
 * weeks, so the plan was six weeks overdue before the question was
 * asked. She is 26 weeks now. The stem also asked for the answer
 * "according to RCOG guidance", which is the question naming its own
 * source; the guidance is printed under the card.
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

const EDITS = [
  {
    id: 1861,
    stem:
      "A 32-year-old woman with a dichorionic diamniotic twin pregnancy is seen in the antenatal clinic at 16 weeks. She is asymptomatic and has had no previous preterm birth. She asks what screening the evidence supports for identifying her risk of spontaneous preterm birth.",
  },
  {
    id: 1887,
    stem:
      "A 29-year-old woman with known epilepsy is 26 weeks pregnant. She is taking lamotrigine and levetiracetam for drug-resistant epilepsy. At her antenatal appointment the registrar asks at what gestation serial growth surveillance should commence, and what that surveillance should be.",
  },
];

for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  const problems = [
    ...selfTalkProblems(edit.stem),
    ...ukEnglishProblems(edit.stem),
    ...sourceNarrationProblems(edit.stem),
  ];
  if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);

  console.log(`#${edit.id}`);
  console.log(`   was: ${row.stem as string}`);
  console.log(`   now: ${edit.stem}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem: edit.stem })
      .eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
