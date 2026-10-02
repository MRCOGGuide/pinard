/**
 * #1928 abandoned the ablation before anybody had looked.
 *
 *   npx tsx scripts/fix-1928.mts
 *   npx tsx scripts/fix-1928.mts --apply
 *
 * A surgeon dilates the cervix for a bipolar radiofrequency ablation,
 * the dilator goes at an odd angle, and the stem says hysteroscopy has
 * not yet been performed. The marked answer was to abandon the
 * procedure and take a biopsy, and the explanation gave the reason as
 * "an inability to confirm presence in the uterine cavity at
 * hysteroscopy", which is a finding at a hysteroscopy that had not
 * happened.
 *
 * The source reads in sequence. Before an energy source goes in, "it
 * is essential to ensure that a false passage or perforation has not
 * occurred and documentation that ostia have been identified. This is
 * particularly important if any dilatation is required", and the MHRA
 * requires preoperative hysteroscopy for exactly that. Only then:
 * "If there is a concern about the appearance of the endometrium or
 * the integrity of the cavity, or an inability to confirm presence in
 * the uterine cavity at hysteroscopy, then ablation should be
 * abandoned and a biopsy obtained if required."
 *
 * So trouble at dilatation is the indication for the hysteroscopy, not
 * a contraindication to it, and the answer is the option already in the
 * list and unused: confirm the ostia, exclude a false passage, then
 * proceed. Abandoning stays as the distractor it should always have
 * been, one step further down the same algorithm.
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
  listRecallProblems,
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const ANSWER = "Proceed after confirming ostia and excluding false passage at hysteroscopy";

const STEM =
  "A 42-year-old woman is in theatre for bipolar radiofrequency endometrial ablation for HMB. Dilatation of the cervix to 8 mm was needed to admit the device and the dilator passed at an unexpected angle, leaving the surgeon unsure the cavity was entered. What should be done before the device is introduced?";

const EXPLANATION =
  "An energy source must not be introduced until a false passage or perforation has been excluded and the tubal ostia identified and documented, which matters most where dilatation has been needed, after a previous CS, with an acutely anteverted or retroverted uterus, or where adhesions are suspected. Hysteroscopy is how that is established, and the MHRA requires it before ablation for this purpose. Difficulty at dilatation is a reason to look, not a reason to stop: the ablation is abandoned, and a biopsy taken if one is needed, only where the cavity then cannot be confirmed or its integrity is in doubt. The device's own CO2 cavity integrity test does not replace the hysteroscopic check.";

/* The pre-insertion requirement, and the device's own integrity test. */
const ADD_CITES = [16926, 16928];

for (const text of [STEM, EXPLANATION]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(`${problems.join("; ")}`);
}
const long = explanationLengthProblems(EXPLANATION);
if (long.length) throw new Error(long.join("; "));
const listed = listRecallProblems(STEM);
if (listed.length) throw new Error(listed.join("; "));

const { data: row } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .eq("id", 1928)
  .single();
if (!row) throw new Error("no question 1928");

const options = (row.options ?? []) as { key: string; text: string }[];
const next = options.find((o) => o.text === ANSWER);
if (!next) throw new Error(`"${ANSWER}" is no longer an option`);
if (next.key === row.correct_key) throw new Error("already answered by that option");

/*
  The stem must not hand over the answer, and this one comes close:
  "hysteroscopy" is in the answer and the question is what to do
  before the device goes in. It is kept out of the stem for that
  reason, and the check is here so a later edit cannot put it back.
*/
if (/hysterosc/i.test(STEM)) throw new Error("the stem names the hysteroscopy the answer turns on");

const explanations = ((row.explanations ?? []) as {
  key: string;
  text: string;
  citation_chunk_ids?: number[];
}[]).map((e) => {
  if (e.key !== row.correct_key) return e;
  const cites = (e.citation_chunk_ids ?? []).slice();
  for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
  return {
    ...e,
    key: next.key,
    text: EXPLANATION,
    citation_chunk_ids: cites.sort((a, b) => a - b),
  };
});

const cites = ((row.citation_chunk_ids ?? []) as number[]).slice();
for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);

console.log(`#1928 ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text}`);
console.log(`   stem ${(row.stem as string).split(/\s+/).length} words -> ${STEM.split(/\s+/).length}`);
console.log(`   ${STEM}`);
console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
console.log(`   cites -> ${cites.sort((a, b) => a - b).join(", ")}`);

if (apply) {
  const { error } = await db
    .from("generated_questions")
    .update({
      stem: STEM,
      correct_key: next.key,
      explanations,
      citation_chunk_ids: cites.sort((a, b) => a - b),
    })
    .eq("id", 1928);
  if (error) throw error;
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
