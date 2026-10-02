/**
 * #2002 named both candidates and asked which one.
 *
 *   npx tsx scripts/fix-2002.mts
 *   npx tsx scripts/fix-2002.mts --apply
 *
 * "Her surgeon is deciding between aspiration and cystectomy. What does
 * European Society of Human Reproduction and Embryology guidance
 * recommend to reduce the risk of recurrence?" against a list holding
 * "Laparoscopic cystectomy" and no aspiration. The stem reduced the
 * question to picking the word it had already said.
 *
 * Taking the sentence out leaves the discrimination the source
 * actually draws, excision against ablation: "recommends excision over
 * ablation in more severe endometriosis and when histological
 * confirmation is sought. It also recommends cystectomy over
 * aspiration of endometriomas to reduce the risk of recurrence."
 * Laparoscopic ablation is in the list, so the candidate now chooses
 * between two operations rather than between a word and its absence.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems, emDashProblems } =
  await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const STEM =
  "A 28-year-old woman with an endometrioma on the right ovary, confirmed on imaging, is listed for laparoscopic surgery after a trial of hormonal suppression gave inadequate symptom control. According to European Society of Human Reproduction and Embryology guidance, which operation reduces the risk of recurrence?";

const { data: row } = await db
  .from("generated_questions")
  .select("id, status, stem, correct_key, options")
  .eq("id", 2002)
  .single();
if (!row) throw new Error("no question 2002");

const answer = ((row.options ?? []) as { key: string; text: string }[]).find(
  (o) => o.key === row.correct_key
);
if (answer?.text !== "Laparoscopic cystectomy") throw new Error(`answer has moved: ${answer?.text}`);

const problems = [
  ...selfTalkProblems(STEM),
  ...ukEnglishProblems(STEM),
  ...sourceNarrationProblems(STEM),
  ...emDashProblems(STEM),
];
if (problems.length) throw new Error(problems.join("; "));

/* The point of the edit: neither word of the answer may be in the stem. */
for (const word of ["cystectomy", "aspiration"]) {
  if (STEM.toLowerCase().includes(word)) throw new Error(`the stem still says "${word}"`);
}

console.log(`#2002 ${row.status}  answer ${row.correct_key} unchanged (${answer.text})`);
console.log(`   was: ${row.stem as string}`);
console.log(`   now: ${STEM}`);
console.log(
  `   ${(row.stem as string).split(/\s+/).length} -> ${STEM.split(/\s+/).length} words`
);

if (apply) {
  const { error } = await db.from("generated_questions").update({ stem: STEM }).eq("id", 2002);
  if (error) throw error;
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
