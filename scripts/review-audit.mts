/**
 * What is wrong with the questions waiting in review.
 *
 * Every check the generator applies, plus the ones that are judgement
 * rather than rule — stem length against the bank's own median, an
 * answer conspicuously longer than its distractors, a vignette that
 * names nothing of this specialty. Reports, changes nothing.
 *
 *   npx tsx scripts/review-audit.mts
 *   npx tsx scripts/review-audit.mts --ids        (just the id lists)
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");
const {
  verifyQuestion, overlappingOptionProblems, optionJustificationProblems,
  explanationLengthProblems, studySubjectProblems, studyAttributionProblems,
  sourceNarrationProblems, listRecallProblems, ukEnglishProblems,
} = await import("../src/lib/generation");
const { unexpandedAbbreviations } = await import("../src/lib/abbreviations");

const db = createAdminClient();
const IDS_ONLY = process.argv.includes("--ids");
const w = (s: string) => s.split(/\s+/).filter(Boolean).length;

const all = await fetchAll<any>((f, t) => db.from("generated_questions")
  .select("id,status,format,stem,options,correct_key,explanations,citation_chunk_ids,section_id")
  .in("status", ["approved", "pending"]).order("id").range(f, t));
const pending = all.filter((q) => q.status === "pending");
const approved = all.filter((q) => q.status === "approved");

/** The bank's own habits, taken from what has already been approved. */
const approvedStems = approved.map((q) => w(q.stem)).sort((a, b) => a - b);
const stemP90 = approvedStems[Math.floor((approvedStems.length - 1) * 0.9)];

const OG = /pregnan|obstetric|gynaecolog|labour|caesarean|LSCS|VBAC|postpartum|postnatal|antenatal|intrapartum|perinatal|neonat|fetal|fetus|maternal|mother|menopaus|HRT|endometri|ovar|uter|cervi|vulva|vagin|breast|miscarriage|abortion|contracept|fertilit|IVF|menstrua|PPH|eclampsia|placent|breech|smear|hysterectomy|adnexal|perine|prolapse|incontinen|PCOS|HPV|colposcop|oocyte|embryo|sperm|puberty|amenorrh|menorrh|GDM|gestation|birth|midwif|woman|women|girl|lactat|breastfeed|amnio|chorio|trimester|stillbirth|termination|hysterosc|laparosc|salping|fibroid|urogynae|O&G|maternity|theatre|MRCOG|trainee|premenstrual|PMDD|Bartholin|labial|vulv|dysmenorrh|hysteroscop|oophorect|myomect|cerclage|episiotom|lochia|colposcopy|OSATS|ST3|ST4|ST5/i;

const buckets: Record<string, number[]> = {
  "fails verification": [],
  "unexpanded abbreviation": [],
  "options argue for themselves": [],
  "options not distinguishable": [],
  "explanation over ceiling": [],
  "study is the subject": [],
  "evidence named in the question": [],
  "narrates its source": [],
  "asks which item is listed": [],
  "UK English": [],
  "stem longer than the approved p90": [],
  "answer conspicuously the longest": [],
  "nothing of this specialty": [],
};

for (const q of pending) {
  const exp = (q.explanations ?? []).find((e: any) => e.key === q.correct_key)?.text ?? "";
  const asked = [q.stem, ...(q.options ?? []).map((o: any) => o.text)].join("\n");
  const candidate = [asked, exp].join("\n");

  if (verifyQuestion(q as never, new Set(q.citation_chunk_ids ?? [])).length) buckets["fails verification"].push(q.id);
  if (unexpandedAbbreviations(candidate).length) buckets["unexpanded abbreviation"].push(q.id);
  if (optionJustificationProblems(q.options ?? []).length) buckets["options argue for themselves"].push(q.id);
  if (overlappingOptionProblems(q.options ?? []).length) buckets["options not distinguishable"].push(q.id);
  if (explanationLengthProblems(exp).length) buckets["explanation over ceiling"].push(q.id);
  if (studySubjectProblems(q.stem).length) buckets["study is the subject"].push(q.id);
  if (studyAttributionProblems(asked).length) buckets["evidence named in the question"].push(q.id);
  if (sourceNarrationProblems(candidate).length) buckets["narrates its source"].push(q.id);
  if (listRecallProblems(q.stem).length) buckets["asks which item is listed"].push(q.id);
  if (ukEnglishProblems(candidate).length) buckets["UK English"].push(q.id);
  if (w(q.stem) > stemP90) buckets["stem longer than the approved p90"].push(q.id);
  if (!OG.test(candidate)) buckets["nothing of this specialty"].push(q.id);

  const correct = (q.options ?? []).find((o: any) => o.key === q.correct_key);
  const others = (q.options ?? []).filter((o: any) => o.key !== q.correct_key);
  if (correct && others.length && q.format === "sba") {
    const cw = w(correct.text);
    const mean = others.reduce((s: number, o: any) => s + w(o.text), 0) / others.length;
    const longest = Math.max(...others.map((o: any) => w(o.text)));
    if (cw > longest && cw >= 20 && cw / mean >= 1.4) buckets["answer conspicuously the longest"].push(q.id);
  }
}

console.log(`${pending.length} questions in review (approved stem p90 = ${stemP90} words)\n`);
const flagged = new Set<number>();
for (const [name, ids] of Object.entries(buckets)) {
  if (ids.length === 0) continue;
  ids.forEach((i) => flagged.add(i));
  console.log(`${String(ids.length).padStart(4)}  ${name}`);
  if (IDS_ONLY || ids.length <= 30) console.log(`      ${ids.join(" ")}`);
}
console.log(`\n${flagged.size} of ${pending.length} carry at least one; ${pending.length - flagged.size} are clean on every check.`);
