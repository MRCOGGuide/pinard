/**
 * #1962 re-pointed: the same magnesium rule as #1974, now the steroid cover.
 *
 *   npx tsx scripts/fix-1962.mts
 *   npx tsx scripts/fix-1962.mts --apply
 *
 * #1962 and #1974 both taught that the maintenance infusion of
 * magnesium is halved when the kidneys are failing, both in section
 * 35, so a candidate could meet the rule twice in one sitting. #1974 is
 * the better question: four magnesium options, real numbers, and the
 * 24-hour course in its explanation. #1962's list offered only two
 * infusion rates and one of them was "double", so the scenario could be
 * answered by shape.
 *
 * Its own cited passage carries a fact the set does not test and the
 * bank does not have anywhere: "Women taking more than 7.5 mg
 * prednisolone per day for more than two weeks during pregnancy require
 * intravenous hydrocortisone (50-100 mg every 6-8 hours) during labour
 * and until they are able to tolerate oral medication."
 *
 * The old stem already said she had taken prednisolone 10 mg daily
 * throughout pregnancy, where it sat as a detail the question never
 * used. It is now the question.
 *
 * The two infusion-rate options go, nothing in the set referring to an
 * infusion any more, and four steroid options arrive, one axis apart:
 * the right drug at the wrong frequency, the right idea by the wrong
 * route, and no cover at all.
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

const SET = [1960, 1961, 1962];

const DROP = ["Double the maintenance infusion rate", "Halve the maintenance infusion rate"];

const ANSWER =
  "Intravenous hydrocortisone 50–100 mg every 6–8 hours until oral medication is tolerated";

const ADD = [
  ANSWER,
  "Intravenous hydrocortisone 100 mg as a single dose at delivery",
  "Double the oral prednisolone for the duration of labour",
  "No additional corticosteroid cover is required",
];

const STEM =
  "A 29-year-old woman with a renal transplant is admitted in spontaneous labour at 36 weeks. She has taken prednisolone 10 mg daily throughout the pregnancy alongside tacrolimus and azathioprine, and her graft function is stable. What does she require during labour?";

const EXPLANATION =
  "A woman who has taken more than 7.5 mg of prednisolone a day for more than two weeks during pregnancy needs intravenous hydrocortisone, 50 to 100 mg every 6 to 8 hours, during labour and until she can tolerate her oral medication again. Her other immunosuppression continues unchanged. Vaginal birth in an obstetric unit is the recommended mode of delivery after renal transplantation, because the graft is extraperitoneal and does not obstruct delivery; caesarean section carries a 1–2% risk of trauma to the allograft.";

const GROUNDS = [
  "Women taking more than 7.5 mg prednisolone per day for more than two weeks during pregnancy require intravenous hydrocortisone (50–100 mg every 6–8 hours) during labour and until they are able to tolerate oral medication",
  "Vaginal birth in an obstetric unit is the recommended mode of delivery for women with a renal transplant",
  "The transplanted organ is extraperitoneal and does not obstruct delivery",
  "The risk of trauma to the renal graft at caesarean section is estimated to be 1–2%",
];

for (const text of [STEM, EXPLANATION, ...ADD]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(`${text.slice(0, 40)}: ${problems.join("; ")}`);
}
const long = explanationLengthProblems(EXPLANATION);
if (long.length) throw new Error(long.join("; "));

const { data: set } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .in("id", SET)
  .order("id");
if (set?.length !== SET.length) throw new Error("the set has changed");

const mine = set.find((r) => r.id === 1962)!;

/* Both claims must be in #1962's own passages; no new citation needed. */
{
  const cites = new Set<number>((mine.citation_chunk_ids ?? []) as number[]);
  for (const e of (mine.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
    for (const id of e.citation_chunk_ids ?? []) cites.add(id);
  }
  const { data: chunks, error } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", [...cites]);
  if (error) throw error;
  const passage = (chunks ?? [])
    .map((c) => (c.text as string) ?? "")
    .join("\n")
    .replace(/\s+/g, " ");
  for (const quote of GROUNDS) {
    if (!passage.includes(quote)) {
      throw new Error(`the passages do not contain "${quote.slice(0, 70)}"`);
    }
  }
}

const current = (set[0].options ?? []) as { key: string; text: string }[];
for (const text of DROP) {
  if (!current.some((o) => o.text === text)) throw new Error(`"${text}" is no longer an option`);
}

/* Nothing else may be answered by an option this removes. */
for (const row of set) {
  if (row.id === 1962) continue;
  const answerText = ((row.options ?? []) as { key: string; text: string }[]).find(
    (o) => o.key === row.correct_key
  )?.text;
  if (answerText && DROP.includes(answerText)) {
    throw new Error(`#${row.id} is answered by "${answerText}"`);
  }
}

const texts = [...current.map((o) => o.text).filter((t) => !DROP.includes(t)), ...ADD];
if (new Set(texts).size !== texts.length) throw new Error("an option is duplicated");

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}`);
console.log();

for (const row of set) {
  const was = (row.options ?? []) as { key: string; text: string }[];
  const answerText = was.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no option for ${row.correct_key}`);
  const wanted = row.id === 1962 ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const repointed = row.id === 1962;
  const explanations = ((row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[]).map((e) =>
    e.key === row.correct_key
      ? { ...e, key: next.key, ...(repointed ? { text: EXPLANATION } : {}) }
      : e
  );

  const update: Record<string, unknown> = {
    options: OPTIONS,
    correct_key: next.key,
    explanations,
  };
  if (repointed) update.stem = STEM;

  console.log(`#${row.id} ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text.slice(0, 70)}`);
  if (repointed) {
    console.log(`   was: ${row.stem as string}`);
    console.log(`   now: ${STEM}`);
    console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
