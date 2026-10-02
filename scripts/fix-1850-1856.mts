/**
 * #1850's pre-eclampsia came too early; #1856 named its own answer.
 *
 *   npx tsx scripts/fix-1850-1856.mts
 *   npx tsx scripts/fix-1850-1856.mts --apply
 *
 * #1850 had a singleton pregnancy with "fulminating pre-eclampsia" at
 * 23+5 weeks. Pre-eclampsia that early is the exception rather than the
 * rule, and when it happens it is in a multiple or a molar pregnancy:
 * the library's own GTD guideline lists "early-onset pre-eclampsia"
 * among the less common presentations of a molar pregnancy. A molar
 * pregnancy is not delivered by classical caesarean with a baby to
 * resuscitate, so the scenario is a twin pregnancy, which is where
 * early-onset pre-eclampsia is met in practice and which belongs in a
 * set about birth at the edge of viability anyway.
 *
 * #1856 ended "She asks about injectable progestogen contraception",
 * and the answer is "Injectable progestogen: appropriate despite
 * enzyme-inducing medication". The question answered itself. What it
 * means to test is that bosentan induces CYP2C9 and CYP3A4 and so
 * defeats oral and implanted progestogens and every combined method,
 * leaving the injectable, and the candidate should have to know that.
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

const EDITS = [
  {
    id: 1850,
    stem:
      "A 32-year-old woman with a dichorionic twin pregnancy at 23+5 weeks requires emergency delivery by classical CS for early-onset pre-eclampsia with severe haematological compromise. During pre-operative counselling she asks about her risk of serious maternal complications. What figure should she be quoted?",
  },
  {
    id: 1856,
    stem:
      "A 34-year-old nulliparous woman with idiopathic pulmonary hypertension takes bosentan. She has been using a low-dose POP and asks for a more reliable long-term method. She is not pregnant, has no history of pelvic infection and is at low risk of sexually transmitted infection. What is the most appropriate contraceptive recommendation?",
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
    ...emDashProblems(edit.stem),
  ];
  if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);

  /*
    The stem must not write the answer out, unless the answer is a
    figure: there the number is the content, and the words around it
    ("serious maternal complications after classical CS") are the
    question's own subject.
  */
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answer = options.find((o) => o.key === row.correct_key)?.text ?? "";
  const own = (answer.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter(
    (w) => !["appropriate", "despite", "approximately", "serious", "complications", "occur", "after", "counsel"].includes(w)
  );
  const echoed = own.filter((w) => edit.stem.toLowerCase().includes(w));
  if (!/\d/.test(answer) && own.length >= 2 && echoed.length === own.length) {
    throw new Error(`#${edit.id}: the stem still writes the answer out`);
  }

  console.log(`#${edit.id}  ${(row.stem as string).split(/\s+/).length} words -> ${edit.stem.split(/\s+/).length}`);
  console.log(`   ${edit.stem}`);

  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem: edit.stem })
      .eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
