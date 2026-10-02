/**
 * #1951 took the test of cure two months late and never said when it is due.
 *
 *   npx tsx scripts/fix-1951.mts
 *   npx tsx scripts/fix-1951.mts --apply
 *
 * A woman treated by LLETZ for CIN3 "eight months ago" attends "her
 * follow-up appointment", and the explanation opens "Under the
 * test-of-cure protocol". The protocol is specific: "after treatment
 * for all grades of CIN, women are invited for follow-up at 6 months
 * for a repeat cytology and HPV test either in the community or in a
 * cytology clinic within the colposcopy department". Eight months is
 * not that appointment, and the card never told the candidate what the
 * interval is, which is the one thing about test of cure they are
 * asked to know. #1952, in the same set, says six months.
 *
 * The marked answer does not change, HR-HPV positive at test of cure
 * goes back to colposcopy whatever the cytology. What changes is that
 * the woman is now at her test of cure, and the explanation gives the
 * interval, the setting and the other arms of the algorithm.
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

const STEM =
  "A 38-year-old woman had a large loop excision of the transformation zone (LLETZ) for CIN3 and attends for her test of cure. Her cytology is reported as borderline change in squamous cells and her HR-HPV test is positive. What is the most appropriate next step?";

const EXPLANATION =
  "Test of cure after treatment for any grade of CIN is a repeat cytology and HPV test at 6 months, taken either in the community or in a cytology clinic within the colposcopy department. A woman who is HR-HPV-positive at that test is referred back to colposcopy whatever her cytology grade, as is a woman whose cytology is high-grade dyskaryosis or worse. Cytology that is negative, borderline or low-grade with a negative HPV test means recall for a screening test in 3 years irrespective of age, and a return to routine recall if that test is cytologically negative.";

/* Every clause above, as the passage states it. */
const GROUNDS = [
  "after treatment for all grades of CIN, women are invited for follow-up at 6 months for a repeat cytology and HPV test either in the community or in a cytology clinic within the colposcopy department",
  "Those who are HR-HPV-positive are referred back to colposcopy, as are women with cytology reported as high-grade dyskaryosis or worse",
  "recalled for a screening test in 3 years, irrespective of age",
];

for (const text of [STEM, EXPLANATION]) {
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

/*
  The stem must not say when the test of cure is: that is the fact the
  explanation teaches, and a candidate counting months in the stem is
  not the question. "6 months" belongs in the explanation only.
*/
if (/\bmonths?\b/i.test(STEM)) throw new Error("the stem still dates the appointment");

const { data: row } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
  .eq("id", 1951)
  .single();
if (!row) throw new Error("no question 1951");

const answer = ((row.options ?? []) as { key: string; text: string }[]).find(
  (o) => o.key === row.correct_key
);
if (answer?.text !== "Refer to colposcopy") throw new Error(`answer has moved: ${answer?.text}`);

const cites = new Set<number>((row.citation_chunk_ids ?? []) as number[]);
for (const e of (row.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
  for (const id of e.citation_chunk_ids ?? []) cites.add(id);
}
const { data: chunks, error: chunkError } = await db
  .from("content_chunks")
  .select("id, text")
  .in("id", [...cites]);
if (chunkError) throw chunkError;
const passage = (chunks ?? [])
  .map((c) => (c.text as string) ?? "")
  .join("\n")
  .replace(/\s+/g, " ");
for (const quote of GROUNDS) {
  if (!passage.includes(quote)) throw new Error(`the passages do not contain "${quote.slice(0, 60)}..."`);
}

const explanations = ((row.explanations ?? []) as {
  key: string;
  text: string;
  citation_chunk_ids?: number[];
}[]).map((e) => (e.key === row.correct_key ? { ...e, text: EXPLANATION } : e));

console.log(`#1951 ${row.status}  answer ${row.correct_key} unchanged (${answer.text})`);
console.log(`   was: ${row.stem as string}`);
console.log(`   now: ${STEM}`);
console.log(`   explanation ${EXPLANATION.split(/\s+/).length} words`);

if (apply) {
  const { error } = await db
    .from("generated_questions")
    .update({ stem: STEM, explanations })
    .eq("id", 1951);
  if (error) throw error;
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
