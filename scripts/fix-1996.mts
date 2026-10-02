/**
 * #1996 answered a management question with a scan, and the scan was gadolinium.
 *
 *   npx tsx scripts/fix-1996.mts
 *   npx tsx scripts/fix-1996.mts --apply
 *
 * A 7 cm hepatic adenoma, known before pregnancy, asymptomatic at 16
 * weeks, MDT consulted, "what is the most appropriate management for
 * this lesion?" The marked answer was gadolinium-enhanced MRI. Three
 * things wrong with that, and the grounding audit found the first:
 *
 *  - The passage establishes contrast MRI as the way to characterise a
 *    lesion, not as the management of one already characterised. This
 *    lesion has been imaged and measured.
 *  - Size is what decides here, and the passage is explicit: "For HAs
 *    greater than 5 cm at presentation or with evidence of recent
 *    haemorrhage, surgical resection may be advocated either during
 *    pregnancy or delayed to the puerperium after assessment of
 *    individual risk and maternal wishes."
 *  - This 2016 review says "Gadolinium is considered safe in
 *    pregnancy". The 2025 review in the same library says "Gadolinium
 *    contrast should be avoided due to the risk of teratogenicity",
 *    which is #998's answer and UK practice. Two cards cannot teach
 *    opposite things about the same contrast agent in the same patient,
 *    and the later source governs.
 *
 * So the answer becomes resection, and the option carries the timing
 * the passage gives rather than forcing "before delivery", which the
 * passage does not say: the choice between operating now and waiting
 * for the puerperium is made on individual risk and what she wants.
 * Gadolinium-enhanced MRI stays in the list, now wrong, which is where
 * a candidate who has read the 2016 review will reach for it.
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

const SET = [1994, 1995, 1996];

const WAS = "Elective surgical resection before delivery";
const ANSWER =
  "Elective surgical resection, during pregnancy or deferred to the puerperium according to individual risk";

const STEM =
  "A 35-year-old woman is referred at 16 weeks of gestation with a hepatic adenoma that was identified before this pregnancy and measures 7 cm. She is asymptomatic and haemodynamically stable, and the hepatobiliary multidisciplinary team has been consulted. What is the most appropriate management?";

const EXPLANATION =
  "An adenoma larger than 5 cm at presentation, or one that has recently bled, is managed by surgical resection, timed either during the pregnancy or in the puerperium after weighing individual risk against the woman's wishes. Size is what drives that: across all hepatic adenomas the lifetime risk of haemorrhage is 27.2% and the rupture rate 15.8%, rupture is most likely in the third trimester as flow through the lesion rises, and a lesion can grow as pregnancy advances. The risk of malignant transformation is 4.2–10% overall and 4.4% below 5 cm.";

const GROUNDS = [
  "For HAs greater than 5 cm at presentation or with evidence of recent haemorrhage, surgical resection may be advocated either during pregnancy or delayed to the puerperium after assessment of individual risk and maternal wishes",
  "27.2% lifetime risk of haemorrhage and a 15.8% rupture rate",
  "The risk of rupture appears highest in the third trimester",
  "risk of malignant transformation of any hepatic adenoma is thought to be 4.2–10% and the risk is lower in lesions less than 5 cm (4.4%)",
  "HAs can grow during pregnancy",
];

/* The chunks that carry the size rule, if not already cited. */
const ADD_CITES = [17461, 17462];

for (const text of [STEM, EXPLANATION, ANSWER]) {
  const problems = [
    ...selfTalkProblems(text),
    ...ukEnglishProblems(text),
    ...sourceNarrationProblems(text),
    ...emDashProblems(text),
  ];
  if (problems.length) throw new Error(problems.join("; "));
}
const long = explanationLengthProblems(EXPLANATION);
if (long.length) throw new Error(long.join("; "));

const { data: set } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .in("id", SET)
  .order("id");
if (set?.length !== SET.length) throw new Error("the set has changed");

const current = (set[0].options ?? []) as { key: string; text: string }[];
if (!current.some((o) => o.text === WAS)) throw new Error(`"${WAS}" is no longer an option`);

const texts = current.map((o) => (o.text === WAS ? ANSWER : o.text));
if (new Set(texts).size !== texts.length) throw new Error("an option is duplicated");

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

/* The claims go in #1996's card, so they are checked against its passages. */
{
  const mine = set.find((r) => r.id === 1996)!;
  const cites = new Set<number>([...((mine.citation_chunk_ids ?? []) as number[]), ...ADD_CITES]);
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

for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}`);
console.log();

for (const row of set) {
  const was = (row.options ?? []) as { key: string; text: string }[];
  const answerText = was.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no option for ${row.correct_key}`);
  const wanted = row.id === 1996 ? ANSWER : answerText === WAS ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const mine = row.id === 1996;
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
  }

  console.log(`#${row.id} ${row.status}  ${row.correct_key} -> ${next.key}  ${next.text.slice(0, 70)}`);
  if (mine) {
    console.log(`   stem ${(row.stem as string).split(/\s+/).length} -> ${STEM.split(/\s+/).length} words`);
    console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);
    console.log(`   cites -> ${(update.citation_chunk_ids as number[]).join(", ")}`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
