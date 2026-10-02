/**
 * #2000 examined one telephone survey of 81 women.
 *
 *   npx tsx scripts/fix-2000.mts
 *   npx tsx scripts/fix-2000.mts --apply
 *
 * "After MRgFUS, what proportion of women did not require further
 * surgical intervention at follow-up of approximately 33 months?",
 * answer 69%. The figure is Machtinger et al., telephone interviews at
 * 33 months (plus or minus 15) with 81 women. A candidate cannot be
 * expected to carry that, and should not: it is one small cohort, not
 * a number anyone counsels with.
 *
 * The same paragraph holds the fact that is examinable, and the option
 * list already held it, unused: "The Food and Drug Administration
 * approved this treatment in 2004 but the National Institute for
 * Health and Care Excellence advises its use only in research and
 * audit settings." The current NICE guidance on heavy menstrual
 * bleeding in the library does not mention the technique at all, so
 * nothing supersedes that.
 *
 * Two options are added because without them the question could be
 * answered by shape: every other option in this set is a figure, so
 * "research and audit settings only" against "unrestricted clinical
 * use" would be a coin toss for a candidate who recognised neither.
 * One of the two is the trap the passage sets up, since the treatment
 * is "not yet recommended for women wishing to preserve fertility".
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

const SET = [1999, 2000];

const ANSWER = "Research and audit settings only";
const ADD = [
  "Only in women who wish to preserve their fertility",
  "Only where hysterectomy is contraindicated",
];

const STEM =
  "A 39-year-old woman with symptomatic fibroids has read about magnetic resonance-guided focused ultrasound and asks to be referred for it. She has completed her family and wishes to avoid surgery. According to NICE, how should this treatment be used?";

const EXPLANATION =
  "Magnetic resonance-guided focused ultrasound is advised for use only in research and audit settings in the UK, despite Food and Drug Administration approval in 2004, and it is not recommended for a woman who wishes to preserve her fertility. Where it is used, less vascular fibroids of low signal intensity on MRI respond better than vascular fibroids of high signal intensity, and a woman with a hyperintense fibroid is more likely to need further treatment (OR 2.96, 95% CI 1.01–8.71). Adverse effects are usually transient: mild skin burn, nausea, buttock or leg pain and transient sciatic nerve palsy.";

const GROUNDS = [
  "the National Institute for Health and Care Excellence advises its use only in research and audit settings",
  "The Food and Drug Administration approved this treatment in 2004",
  "This treatment is not yet recommended for women wishing to preserve fertility",
  "Less vascular fibroids with low signal intensity on MRI were more likely to respond to treatment than high signal intensity vascular fibroids",
  "the OR was 2.96 (95% CI 1.01–8.71)",
  "Transient adverse effects included mild skin burn, nausea, short-term buttock or leg pain and transient sciatic nerve palsy",
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
const listed = listRecallProblems(STEM);
if (listed.length) throw new Error(listed.join("; "));

const { data: set } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .in("id", SET)
  .order("id");
if (set?.length !== SET.length) throw new Error("the set has changed");

const mine = set.find((r) => r.id === 2000)!;

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
if (!current.some((o) => o.text === ANSWER)) throw new Error(`"${ANSWER}" is not in the list`);

const texts = [...current.map((o) => o.text), ...ADD];
if (new Set(texts).size !== texts.length) throw new Error("an option is duplicated");

const OPTIONS = [...texts]
  .sort((a, b) => a.localeCompare(b))
  .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

/*
  The point of the two added options: the answer must not be the only
  option of its kind. A figure is a different kind of answer from a
  statement about how a treatment may be used.
*/
const notFigures = OPTIONS.filter((o) => !/^\d|^\d+ in |%$/.test(o.text)).length;
if (notFigures < 4) throw new Error(`only ${notFigures} options are not figures`);

for (const o of OPTIONS) console.log(`  ${o.key}. ${o.text}`);
console.log();

for (const row of set) {
  const was = (row.options ?? []) as { key: string; text: string }[];
  const answerText = was.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no option for ${row.correct_key}`);
  const wanted = row.id === 2000 ? ANSWER : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const repointed = row.id === 2000;
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
