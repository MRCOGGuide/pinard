/**
 * #1903 treated obstetric APS with aspirin alone. RCOG says aspirin and heparin.
 *
 *   npx tsx scripts/fix-1903.mts
 *   npx tsx scripts/fix-1903.mts --apply
 *
 * A woman with antiphospholipid syndrome and a prior fetal loss was
 * marked as needing "Low-dose aspirin alone", on the strength of one
 * randomised trial of 98 women whose authors concluded that aspirin
 * should be first line. Green-top Guideline No. 17 (4th edition, 2023)
 * recommends the opposite, at Grade B: "Aspirin and heparin
 * (unfractionated heparin [UFH] or LMWH) should be offered to women
 * with APS (e.g. 75 mg aspirin orally and 40 mg subcutaneously
 * enoxaparin from a positive pregnancy test until at least 34 weeks of
 * gestation)", because meta-analyses show the combination confers a
 * significant benefit. The patient leaflet says the same in plain
 * words. NICE has nothing on APS treatment.
 *
 * The question was written from a 2017 TOG review of thrombophilia
 * testing, and the trap is in the source itself: the review states
 * that "aspirin and LMWH are recommended for obstetrical
 * antiphospholipid syndrome" and then recounts the trial, whose
 * authors' conclusion the question took for the recommendation. An
 * author's conclusion in a cited study is not guidance.
 *
 * So the answer moves to aspirin plus LMWH, and the three
 * antithrombotic options become whole prescriptions, each differing
 * from the answer on one axis: the heparin dropped, the aspirin
 * dropped, or the right drugs started and stopped at the wrong time.
 * The unused "High-dose steroids plus plasma exchange" makes room, A
 * being the catastrophic-APS option the source gives.
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

const GROUP_IDS = [1902, 1903];

const STEM =
  "A 29-year-old woman is 7 weeks pregnant. She has antiphospholipid syndrome, diagnosed on a lupus anticoagulant that was positive twice 12 weeks apart after a fetal loss at 16 weeks. She has never had a venous thromboembolism. What should she be offered in this pregnancy?";

const ANSWER =
  "Aspirin 75 mg daily plus enoxaparin 40 mg daily from a positive pregnancy test until at least 34 weeks";

/* Dropped: the second catastrophic-APS option, which no scenario uses. */
const DROP = "High-dose steroids plus plasma exchange";

/* Replaced by whole prescriptions, one axis apart from the answer. */
const REPLACE: Record<string, string> = {
  "LMWH alone":
    "Enoxaparin 40 mg daily alone from a positive pregnancy test until at least 34 weeks",
  "LMWH plus low-dose aspirin": ANSWER,
  "Low-dose aspirin alone":
    "Aspirin 75 mg daily alone from a positive pregnancy test until at least 34 weeks",
};

/* The timing arm: right drugs, right doses, started and stopped wrong. */
const ADD = ["Aspirin 75 mg daily plus enoxaparin 40 mg daily from 12 weeks until delivery"];

const EXPLANATION =
  "Antiphospholipid syndrome in pregnancy is treated with aspirin and heparin together: aspirin 75 mg orally with enoxaparin 40 mg subcutaneously daily, from the positive pregnancy test until at least 34 weeks. The pooled benefit is clearest for aspirin with unfractionated heparin, which cut the miscarriage rate by 54% against aspirin alone (RR 0.46, 95% CI 0.29–0.71); LMWH is the heparin used in practice because trials show no difference in efficacy or safety between the two, and it is given once daily with less heparin-induced thrombocytopenia and a lower risk of osteoporosis. Heparin does not cross the placenta. Treatment does not make the pregnancy low risk: complications remain likely in all three trimesters.";

/* Green-top 17 section 7.2.1 and its evidence, and the patient leaflet. */
const ADD_CITES = [3851, 3852];
const ADD_DOCS = [15];

for (const text of [STEM, EXPLANATION, ANSWER, ...Object.values(REPLACE), ...ADD]) {
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
const listed = listRecallProblems(STEM);
if (listed.length) throw new Error(listed.join("; "));

const { data: set } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids, source_document_ids")
  .in("id", GROUP_IDS)
  .order("id");
if (set?.length !== GROUP_IDS.length) throw new Error("the set has changed");

const current = (set[0].options ?? []) as { key: string; text: string }[];
for (const was of [DROP, ...Object.keys(REPLACE)]) {
  if (!current.some((o) => o.text === was)) throw new Error(`"${was}" is no longer an option`);
}

const texts = [
  ...current
    .map((o) => o.text)
    .filter((t) => t !== DROP)
    .map((t) => REPLACE[t] ?? t),
  ...ADD,
];
if (new Set(texts).size !== texts.length) throw new Error("an option is duplicated");
if (texts.length !== current.length) throw new Error(`the list would be ${texts.length} long`);

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}`);
console.log();

for (const row of set) {
  const was = (row.options ?? []) as { key: string; text: string }[];
  const answerText = was.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no option for ${row.correct_key}`);

  /* #1903's answer moves; #1902's keeps whatever its text became. */
  const wanted = row.id === 1903 ? ANSWER : (REPLACE[answerText] ?? answerText);
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  /*
    Spread, not rebuilt: each explanation carries its own
    citation_chunk_ids, and that is the array the grounding audit
    reads, not the row's column. Writing {key, text} drops it and the
    question then "cites nothing".
  */
  const explanations = ((row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[]).map((e) => {
    if (e.key !== row.correct_key) return e;
    const moved = { ...e, key: next.key };
    if (row.id !== 1903) return moved;
    const cites = (moved.citation_chunk_ids ?? []).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    return { ...moved, text: EXPLANATION, citation_chunk_ids: cites.sort((a, b) => a - b) };
  });

  const update: Record<string, unknown> = {
    options: OPTIONS,
    correct_key: next.key,
    explanations,
  };

  if (row.id === 1903) {
    update.stem = STEM;
    const cites = ((row.citation_chunk_ids ?? []) as number[]).slice();
    for (const id of ADD_CITES) if (!cites.includes(id)) cites.push(id);
    update.citation_chunk_ids = cites.sort((a, b) => a - b);
    const docs = ((row.source_document_ids ?? []) as number[]).slice();
    for (const id of ADD_DOCS) if (!docs.includes(id)) docs.push(id);
    update.source_document_ids = docs.sort((a, b) => a - b);
  }

  console.log(`#${row.id} ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text}`);
  if (row.id === 1903) {
    console.log(`   stem ${(row.stem as string).split(/\s+/).length} words -> ${STEM.split(/\s+/).length}`);
    console.log(`   ${STEM}`);
    console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
    console.log(`   cites -> ${(update.citation_chunk_ids as number[]).join(", ")}`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
