/**
 * What fifteen questions are allowed to say.
 *
 *   npx tsx scripts/test-diagnostic.mts
 *
 * Two rules the free diagnostic has to keep. It must spread across the
 * syllabus rather than pooling where the bank is deepest, because a
 * candidate judges the breadth of their revision by it. And it must
 * report a module score, where five questions make a figure, while
 * naming a missed sub-topic as missed rather than weak, because one
 * question cannot establish weakness and saying otherwise would be a
 * lie told in the product's own favour.
 */
import {
  spreadAcrossSyllabus,
  summariseDiagnostic,
  type Candidate,
} from "../src/lib/diagnostic";
import type { Section } from "../src/lib/types";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got ${a}\n      want ${b}`);
    failed += 1;
  }
}

/* The real shape: Obstetrics 9 sub-topics, Gynaecology 13, Governance 13. */
const MODULES: [number, string, number][] = [
  [1, "Obstetrics", 9],
  [2, "Gynaecology", 13],
  [3, "Governance", 13],
];
const candidates: Candidate[] = MODULES.flatMap(([moduleId, moduleTitle, n]) =>
  Array.from({ length: n }, (_, i) => ({
    sectionId: moduleId * 100 + i,
    title: `${moduleTitle} ${i + 1}`,
    moduleId,
    moduleTitle,
    available: 30,
  }))
);

const fifteen = spreadAcrossSyllabus(candidates, 15);
check("fifteen questions", fifteen.length, 15);
check(
  "one sub-topic each",
  new Set(fifteen.map((c) => c.sectionId)).size,
  15
);
const perModule = MODULES.map(
  ([id]) => fifteen.filter((c) => c.moduleId === id).length
);
check("five from each module", perModule, [5, 5, 5]);

/* A module that runs out stops taking turns; the rest still fill up. */
const lopsided: Candidate[] = [
  ...candidates.filter((c) => c.moduleId !== 1),
  { sectionId: 100, title: "Obstetrics 1", moduleId: 1, moduleTitle: "Obstetrics", available: 30 },
];
const short = spreadAcrossSyllabus(lopsided, 15);
check("still fifteen when a module is thin", short.length, 15);
check(
  "the thin module gives what it has and no more",
  short.filter((c) => c.moduleId === 1).length,
  1
);

/* A sub-topic with nothing approved is not offered at all. */
const empty = spreadAcrossSyllabus(
  candidates.map((c) => ({ ...c, available: c.sectionId === 100 ? 0 : c.available })),
  15
);
check("an empty sub-topic is skipped", empty.some((c) => c.sectionId === 100), false);

/* A bank too small for fifteen returns what exists rather than padding. */
check(
  "a short bank returns what it has",
  spreadAcrossSyllabus(candidates.slice(0, 4), 15).length,
  4
);

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

check(
  "nothing answered is zero, not a division by nothing",
  summariseDiagnostic([], sections, 35).percent,
  0
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
