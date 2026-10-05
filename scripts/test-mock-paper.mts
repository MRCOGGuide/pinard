/**
 * Does a paper advertised as fifty and fifty actually hold a hundred?
 *
 *   npx tsx scripts/test-mock-paper.mts
 *
 * It did not. The EMQ selection stopped once the count had been
 * reached, having already taken the set that reached it, so a paper
 * standing at 48 took a set of three and sat 101. It was spotted by a
 * candidate counting the questions, which is the worst way for a
 * number on a product like this to be wrong: nothing was broken, so
 * nothing complained, and the brief above it was simply untrue.
 */
import {
  packEmqSets,
  sectionBreakdown,
  emqSetScore,
  markPaper,
  FULL_PAPER,
  paperSeconds,
} from "../src/lib/mock";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

const sets = (...sizes: number[]) =>
  sizes.map((n, i) => Array.from({ length: n }, (_, j) => `s${i}q${j}`));

const count = (taken: string[][]) => taken.reduce((s, g) => s + g.length, 0);

/* ---- a paper is counted in SETS ---- */
/* The fault this replaced: `want` was read as a number of scenarios,
   so a paper asking for fifty EMQs counted the scenarios inside the
   sets, reached fifty, and handed over sixteen sets. */
const sixteen = sets(...Array.from({ length: 400 }, (_, i) => [2, 3, 3, 4][i % 4]));

check(
  "fifty EMQs means fifty sets",
  packEmqSets(sixteen, 50).length === 50,
  `got ${packEmqSets(sixteen, 50).length} sets`
);
check(
  "and not fifty scenarios",
  count(packEmqSets(sixteen, 50)) > 50,
  `scenarios: ${count(packEmqSets(sixteen, 50))}`
);
check(
  "a set is taken whole, however many scenarios are under it",
  packEmqSets(sets(4, 2, 3), 3).every((g, i) => g.length === [4, 2, 3][i])
);
check(
  "a thin bank gives every set it has and no more",
  packEmqSets(sets(3, 3), 50).length === 2
);
check("no sets, no EMQs", packEmqSets([], 50).length === 0);
check("wanting none takes none", packEmqSets(sets(3, 3), 0).length === 0);
check("an empty set is not a set", packEmqSets(sets(0, 3), 50).length === 1);

/* ---- and the paper the brief describes ---- */
check(
  "a full paper is 50 SBAs and 50 EMQ sets",
  FULL_PAPER.sba === 50 && FULL_PAPER.emq === 50
);
check(
  "timed at 70 minutes of SBAs and 110 of EMQ sets",
  Math.round(paperSeconds(FULL_PAPER) / 60) === 180,
  `got ${Math.round(paperSeconds(FULL_PAPER) / 60)} minutes`
);
check(
  "so a set's 132 seconds covers all its scenarios, not each of them",
  Math.round(paperSeconds({ sba: 0, emq: 50 }) / 60) === 110
);

/* ---- what the paper says you should revise ---- */

const paper = [
  { id: 1, section_id: 10, section_title: "Labour" },
  { id: 2, section_id: 10, section_title: "Labour" },
  { id: 3, section_id: 10, section_title: "Labour" },
  { id: 4, section_id: 11, section_title: "Cancer" },
  { id: 5, section_id: 11, section_title: "Cancer" },
  { id: 6, section_id: 12, section_title: "Contraception" },
];
/* Labour 1 of 3, Cancer 2 of 2, Contraception 0 of 1. Question 6 was
   never answered, which the paper treats as wrong, as the hall does. */
const rows = sectionBreakdown(paper, new Set([1, 4, 5]));

check(
  "every topic in the paper is reported",
  rows.length === 3,
  JSON.stringify(rows.map((r) => r.title))
);
check(
  "weakest first",
  rows[0].title === "Contraception" && rows[2].title === "Cancer",
  JSON.stringify(rows.map((r) => `${r.title} ${r.percent}%`))
);
check(
  "an unanswered question counts against the topic, not out of it",
  rows[0].correct === 0 && rows[0].total === 1,
  JSON.stringify(rows[0])
);
check(
  "the count is kept beside the score",
  rows.find((r) => r.title === "Labour")?.correct === 1 &&
    rows.find((r) => r.title === "Labour")?.total === 3
);
check(
  "and the percentage is of what the paper asked, not of the syllabus",
  rows.find((r) => r.title === "Labour")?.percent === 33,
  `got ${rows.find((r) => r.title === "Labour")?.percent}`
);
check(
  "a topic answered perfectly reads 100",
  rows.find((r) => r.title === "Cancer")?.percent === 100
);
check("no paper, no feedback", sectionBreakdown([], new Set()).length === 0);

/* ---- the EMQ half, counted in sets ---- */

check(
  "a set answered perfectly is one whole set",
  emqSetScore([{ correct: 3, total: 3 }]) === 1
);
check(
  "three right out of four is three quarters of a set, not nothing",
  emqSetScore([{ correct: 3, total: 4 }]) === 0.75
);
check(
  "a set answered wrongly throughout is nothing",
  emqSetScore([{ correct: 0, total: 4 }]) === 0
);
check(
  "sets of different sizes are still worth one each",
  emqSetScore([
    { correct: 2, total: 2 },
    { correct: 4, total: 4 },
  ]) === 2,
  "a long set must not outweigh a short one"
);
check(
  "fifty perfect sets score fifty",
  emqSetScore(Array(50).fill({ correct: 3, total: 3 })) === 50
);
check("no sets, no score", emqSetScore([]) === 0);

/* And what that does to the mark. Half the SBAs and all the EMQ sets
   is 20% + 60%. */
const halfSba = markPaper({
  sbaCorrect: 25,
  sbaTotal: 50,
  emqCorrect: 50,
  emqTotal: 50,
  passMark: 70,
});
check(
  "the two halves are weighted 40 and 60, not counted equally",
  halfSba.percent === 80,
  `got ${halfSba.percent}`
);
check("and that passes", halfSba.passed);

/* The reverse: every SBA right and nothing else is 40%, which fails,
   which is the whole reason the weighting exists. */
const sbaOnly = markPaper({
  sbaCorrect: 50,
  sbaTotal: 50,
  emqCorrect: 0,
  emqTotal: 50,
  passMark: 70,
});
check("every SBA and no EMQ is 40%", sbaOnly.percent === 40);
check("which fails", !sbaOnly.passed);

/* Partial sets reach the mark they earn. */
const partial = markPaper({
  sbaCorrect: 40,
  sbaTotal: 50,
  emqCorrect: emqSetScore(Array(50).fill({ correct: 3, total: 4 })),
  emqTotal: 50,
  passMark: 70,
});
check(
  "three quarters of every set earns three quarters of the EMQ mark",
  partial.percent === 77,
  `got ${partial.percent}`
);

/* A paper with no EMQs at all gives the whole mark to the SBAs rather
   than capping everyone at 40. */
const noEmq = markPaper({
  sbaCorrect: 40,
  sbaTotal: 50,
  emqCorrect: 0,
  emqTotal: 0,
  passMark: 70,
});
check("a paper with one format is marked out of that format", noEmq.percent === 80);

console.log(`
${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
