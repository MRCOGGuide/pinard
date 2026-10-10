/**
 * What the diagnostics ask, and what they are allowed to say.
 *
 *   npx tsx scripts/test-diagnostic.mts
 *
 * The free sample diagnostic is fixed: one question from each section,
 * at most 35, about one in four an EMQ scenario, at mixed difficulty,
 * leaving out the questions shown elsewhere for free. The full diagnostic asks two
 * SBAs at different levels and one EMQ set per section, unseen first.
 * The free plan preview gives the same message for the same answers,
 * easy misses in Obstetrics and Gynaecology first. And the summary names
 * a missed section as missed rather than weak, because one question
 * cannot establish weakness.
 */
import {
  formatMinutes,
  freePlanPreview,
  pickFreeDiagnostic,
  pickFullDiagnosticSection,
  summariseDiagnostic,
  timeEstimate,
  type PoolQuestion,
} from "../src/lib/diagnostic";
import type { Section } from "../src/lib/types";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}
      got ${a}
      want ${b}`);
    failed += 1;
  }
}

/* ---- the free diagnostic ---- */

/* 36 sections; each has SBAs at every level and two EMQ sets (of two and
   four scenarios), except section 9, which has no sets, and section 36,
   which is empty. */
let nextId = 1;
const pool: PoolQuestion[] = [];
for (let s = 1; s <= 35; s++) {
  for (let d = 1; d <= 5; d++) pool.push({ id: nextId++, sectionId: s, format: "sba", difficulty: d, groupId: null });
  if (s === 9) continue;
  for (const size of [4, 2]) {
    const g = `g${s}-${size}`;
    for (let k = 0; k < size; k++) pool.push({ id: nextId++, sectionId: s, format: "emq", difficulty: 3, groupId: g });
  }
}
const order = Array.from({ length: 36 }, (_, i) => i + 1);
const free = pickFreeDiagnostic(order, pool, new Set());
const freeIds = free.flatMap((f) => f.ids);
check("between 30 and 35 questions", freeIds.length <= 35 && freeIds.length >= 30, true);
check("one question per item", free.every((f) => f.ids.length === 1), true);
check("at most one per section", new Set(free.map((f) => f.sectionId)).size === free.length, true);
const emqs = free.filter((f) => f.kind === "emq");
const share = emqs.length / free.length;
check("about one in four is an EMQ", share >= 0.2 && share <= 0.3, true);
check("an EMQ is a single scenario", emqs.every((f) => pool.find((q) => q.id === f.ids[0])?.format === "emq"), true);
check("section 9, with no EMQs, asks an SBA", free.find((f) => f.sectionId === 9)?.kind, "sba");
const levels = new Set(free.map((f) => pool.find((q) => q.id === f.ids[0])?.difficulty));
check("the questions range across difficulty", levels.size >= 4, true);
check("the same bank gives the same paper", JSON.stringify(pickFreeDiagnostic(order, pool, new Set())), JSON.stringify(free));

const sampleIds = new Set(pool.filter((q) => q.sectionId === 1).map((q) => q.id));
const withoutSamples = pickFreeDiagnostic(order, pool, sampleIds);
check("questions shown free elsewhere are left out", withoutSamples.some((f) => f.sectionId === 1), false);

const extra: PoolQuestion[] = [...pool, { id: 9001, sectionId: 36, format: "sba", difficulty: 3, groupId: null }];
const capped = pickFreeDiagnostic(order, extra, new Set(), { dropFirst: [35] });
check("over the limit, the named section is left out first", [capped.length, capped.some((f) => f.sectionId === 35), capped.some((f) => f.sectionId === 36)], [35, false, true]);

/* ---- the full diagnostic ---- */

const section2 = pool.filter((q) => q.sectionId === 2);
let seed = 7;
const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const full = pickFullDiagnosticSection(section2, new Set(), random);
const fullRows = full.map((id) => section2.find((q) => q.id === id)!);
check("two SBAs", fullRows.filter((q) => q.format === "sba").length, 2);
check("at two different levels", new Set(fullRows.filter((q) => q.format === "sba").map((q) => q.difficulty)).size, 2);
check("the easier SBA is from the easy end", fullRows[0].difficulty, 1);
check("the harder SBA is from the hard end", fullRows[1].difficulty, 5);
check("one whole EMQ set, the shorter", fullRows.filter((q) => q.format === "emq").length, 2);
const seenEasy = new Set(section2.filter((q) => q.format === "sba" && q.difficulty === 1).map((q) => q.id));
const second = pickFullDiagnosticSection(section2, seenEasy, random).map((id) => section2.find((q) => q.id === id)!);
check("a question already seen is passed over", second.some((q) => seenEasy.has(q.id)), false);
const noSets = pickFullDiagnosticSection(pool.filter((q) => q.sectionId === 9), new Set(), random);
check("no EMQ set: three SBAs instead", noSets.length, 3);

/* ---- timing ---- */

const estimate = timeEstimate([
  { id: 1, format: "sba", emq_group_id: null },
  { id: 2, format: "emq", emq_group_id: "a" },
  { id: 3, format: "emq", emq_group_id: "a" },
]);
check("one to two minutes a question", [estimate.minMinutes, estimate.maxMinutes], [3, 6]);
check("scenarios and sets counted apart", [estimate.sbas, estimate.emqScenarios, estimate.emqSets], [1, 2, 1]);
check("minutes read as hours", [formatMinutes(52), formatMinutes(104), formatMinutes(180)], ["52 minutes", "1 hour 44 minutes", "3 hours"]);

/* ---- the summary ---- */

const sections: Section[] = [
  { id: 1, title: "Obstetrics", parent_id: null },
  { id: 2, title: "Gynaecology", parent_id: null },
  { id: 100, title: "Preterm Birth", parent_id: 1 },
  { id: 101, title: "Labour and Birth", parent_id: 1 },
  { id: 200, title: "Contraception", parent_id: 2 },
].map((s) => ({ ...s, exam: "part2", is_active: true, sort_order: s.id }) as Section);

const summary = summariseDiagnostic(
  [
    { questionId: 1, correct: false, sectionId: 100 },
    { questionId: 2, correct: true, sectionId: 101 },
    { questionId: 3, correct: true, sectionId: 200 },
    { questionId: 4, correct: false, sectionId: 200 },
  ],
  sections,
  35
);
check("the score counts answers, not sections", [summary.correct, summary.asked], [2, 4]);
check("the percentage is rounded", summary.percent, 50);
check(
  "scores roll up to the module",
  summary.modules.map((m) => [m.title, m.correct, m.asked]),
  [["Obstetrics", 1, 2], ["Gynaecology", 1, 2]]
);
check("a missed sub-topic is named once", summary.missed, ["Preterm Birth", "Contraception"]);
check("the untested count is the rest of the syllabus", summary.untested, 32);

/* ---- the free plan preview ---- */

const syllabus: Section[] = [
  { id: 1, title: "Obstetrics", parent_id: null, sort_order: 1 },
  { id: 2, title: "Gynaecology", parent_id: null, sort_order: 2 },
  { id: 3, title: "Governance", parent_id: null, sort_order: 3 },
  { id: 10, title: "Preterm Birth", parent_id: 1, sort_order: 1 },
  { id: 11, title: "Labour and Birth", parent_id: 1, sort_order: 2 },
  { id: 20, title: "Contraception", parent_id: 2, sort_order: 1 },
  { id: 21, title: "Menopause", parent_id: 2, sort_order: 2 },
  { id: 30, title: "Clinical Governance", parent_id: 3, sort_order: 1 },
].map((s) => ({ ...s, exam: "part2", is_active: true }) as Section);

const preview = freePlanPreview(
  [
    { sectionId: 30, correct: false, difficulty: 1 },
    { sectionId: 10, correct: false, difficulty: 4 },
    { sectionId: 21, correct: false, difficulty: 2 },
    { sectionId: 11, correct: true, difficulty: 2 },
    { sectionId: 20, correct: false, difficulty: 3 },
  ],
  syllabus
);
check(
  "easy clinical misses first, then other clinical misses, governance last",
  preview.firstFortnight,
  ["Menopause", "Contraception", "Preterm Birth"]
);
check("the rest follows, misses before secured sections", preview.later, ["Clinical Governance", "Labour and Birth"]);
check("not all correct", preview.allCorrect, false);
check(
  "all correct is said as such",
  freePlanPreview([{ sectionId: 10, correct: true, difficulty: 3 }], syllabus).allCorrect,
  true
);

check(
  "nothing answered is zero, not a division by nothing",
  summariseDiagnostic([], sections, 35).percent,
  0
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
