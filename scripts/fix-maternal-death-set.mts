/**
 * #1773 and #1774 were case reports, not questions.
 *
 *   npx tsx scripts/fix-maternal-death-set.mts
 *   npx tsx scripts/fix-maternal-death-set.mts --apply
 *
 * Both were transcribed from the review's own case series, and a case
 * report's job is to tell you what it was.
 *
 * #1773 named polyvinyl alcohol twice — in the history and again in
 * the autopsy finding — against an option reading "Polyvinyl alcohol
 * particle embolism". Nothing was being asked. The embolisation stays,
 * because it is what happened to her; the material's name goes, so the
 * candidate has to know what uterine artery embolisation is done with
 * and that it can reach the lungs.
 *
 * #1774 did the eliminating itself: "Multidisciplinary review excludes
 * all diagnoses on the standard differential ... except two", then
 * excluded one of the two, then said a diagnosis was reached on the
 * balance of probabilities. The candidate had only to count. The facts
 * that discriminate stay — collapse while the uterus is closed, a
 * negative autopsy, days between collapse and death, no fluid overload
 * — and the differential is theirs to work through.
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
    id: 1773,
    stem:
      "A 40-year-old woman with two previous CS deliveries undergoes a third CS at 40 weeks. Placenta accreta has been diagnosed antenatally. UAE is performed at the time of delivery to reduce placental blood flow, and is repeated two weeks later because placental blood flow persists. She rapidly deteriorates with hypotension; laparotomy finds no intraperitoneal haemorrhage and a subtotal hysterectomy is performed. She dies shortly afterwards. Autopsy reveals all pulmonary arterioles blocked by chains of embolic particles with proximal thrombosis, causing acute cor pulmonale.",
  },
  {
    id: 1774,
    stem:
      "A woman undergoes CS under spinal anaesthesia at 38 weeks. While the uterus is being closed she becomes suddenly breathless, then has a respiratory arrest followed by a cardiac arrest. She survives several days with hypoxic-ischaemic encephalopathy before dying. Full autopsy, including histology and toxicology, is entirely negative apart from the brain injury. Review of the anaesthetic, drug and fluid balance charts shows no evidence of fluid overload.",
  },
];

for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, correct_key, options")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  const problems = [
    ...selfTalkProblems(edit.stem),
    ...ukEnglishProblems(edit.stem),
    ...sourceNarrationProblems(edit.stem),
  ];
  if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);

  /* The point of the edit: the answer's own words are out of the stem. */
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answer = options.find((o) => o.key === row.correct_key)?.text ?? "";
  const distinctive = (answer.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter(
    (w) => !["embolism", "syndrome", "disease", "particle", "particles"].includes(w)
  );
  const leaked = distinctive.filter((w) => edit.stem.toLowerCase().includes(w));
  if (leaked.length) throw new Error(`#${edit.id}: still says ${leaked.join(", ")}`);

  console.log(`#${edit.id}`);
  console.log(`   was: ${(row.stem as string).slice(0, 200)}…`);
  console.log(`   now: ${edit.stem.slice(0, 200)}…`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem: edit.stem })
      .eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
