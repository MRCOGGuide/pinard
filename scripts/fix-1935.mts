/**
 * #1935 named the antidote to magnesium and not the dose.
 *
 *   npx tsx scripts/fix-1935.mts
 *   npx tsx scripts/fix-1935.mts --apply
 *
 * "Calcium gluconate" is the answer a candidate can give and still not
 * be able to treat the woman. Green-top 56 gives the prescription:
 * "Magnesium sulphate toxicity should be managed by slow intravenous
 * injection of 10 ml 10% calcium gluconate or 10 ml 10% calcium
 * chloride."
 *
 * So the answer becomes the whole instruction, and the two added
 * options differ from it on one axis each, the volume and the rate.
 * The volume arm is not invented: the European cardiology guideline in
 * the same library gives 30 ml of 10% for magnesium toxicity in
 * cardiac arrest, and a candidate who has read it has to know which
 * applies in a UK maternity unit. Calcium chloride is deliberately not
 * in the list, being equally correct.
 *
 * The neuroprotection review this set was written from says only that
 * calcium gluconate should be available, so the dose is cited to the
 * guideline that gives it.
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

const GROUP = [1934, 1935, 1936];

const WAS = "Calcium gluconate";
const ANSWER = "Calcium gluconate 10 ml of 10% solution by slow intravenous injection";
const ADD = [
  "Calcium gluconate 30 ml of 10% solution by slow intravenous injection",
  "Calcium gluconate 10 ml of 10% solution by rapid intravenous bolus",
];

const STEM =
  "A woman at 29+1 weeks of gestation has been receiving MgSO4 for neuroprotection for 18 hours. She now reports muscle weakness and her respiratory rate has fallen to 10 breaths per minute. The infusion is stopped. What should she be given?";

const EXPLANATION =
  "MgSO4 has a narrow therapeutic range, and the serious effects of overdose are respiratory depression, pulmonary oedema and cardiac arrest, which is why the infusion is monitored and the antidote kept to hand. Toxicity is managed by slow intravenous injection of 10 ml of 10% calcium gluconate; 10 ml of 10% calcium chloride is an equivalent alternative. A respiratory rate of 10 with muscle weakness is toxicity and not a minor effect: flushing and nausea or vomiting are the common ones, and both are several times more likely on MgSO4 than without it.";

/* Green-top 56, which gives the dose the neuroprotection review omits. */
const ADD_CITES = [19147, 19168];
const ADD_DOCS = [71];

for (const text of [STEM, EXPLANATION, ANSWER, ...ADD]) {
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
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids, source_document_ids")
  .in("id", GROUP)
  .order("id");
if (set?.length !== GROUP.length) throw new Error("the set has changed");

const current = (set[0].options ?? []) as { key: string; text: string }[];
if (!current.some((o) => o.text === WAS)) throw new Error(`"${WAS}" is no longer an option`);

const texts = [...current.map((o) => (o.text === WAS ? ANSWER : o.text)), ...ADD];
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
  const wanted = answerText === WAS ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const mine = row.id === 1935;
  const explanations = ((row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[]).map((e) => {
    if (e.key !== row.correct_key) return e;
    const moved = { ...e, key: next.key };
    if (!mine) return moved;
    const cites = (moved.citation_chunk_ids ?? []).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    return { ...moved, text: EXPLANATION, citation_chunk_ids: cites.sort((a, b) => a - b) };
  });

  const update: Record<string, unknown> = {
    options: OPTIONS,
    correct_key: next.key,
    explanations,
  };

  if (mine) {
    update.stem = STEM;
    const cites = ((row.citation_chunk_ids ?? []) as number[]).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    update.citation_chunk_ids = cites.sort((a, b) => a - b);
    const docs = ((row.source_document_ids ?? []) as number[]).slice();
    for (const id of ADD_DOCS) if (!docs.includes(id)) docs.push(id);
    update.source_document_ids = docs.sort((a, b) => a - b);
  }

  console.log(`#${row.id} ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text.slice(0, 70)}`);
  if (mine) {
    console.log(`   stem ${(row.stem as string).split(/\s+/).length} words -> ${STEM.split(/\s+/).length}`);
    console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
    console.log(`   cites -> ${(update.citation_chunk_ids as number[]).join(", ")}`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
