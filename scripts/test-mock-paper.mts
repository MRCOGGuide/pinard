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

/* ---- it used to overshoot ---- */
const overshoot = packEmqSets(sets(5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3), 50);
check(
  "a set that would overshoot is not taken",
  count(overshoot) <= 50,
  `took ${count(overshoot)}`
);

check(
  "and from that bank fifty is genuinely unreachable, so it stops at 48",
  count(overshoot) === 48,
  `took ${count(overshoot)}`
);

/* ---- then it undershot, and this is the shape that caught it ---- */
/* Three fours and two threes, wanting ten. Taking sets in order while
   they fit gives 4 + 4 = 8 and then nothing else fits, which is where
   the greedy version stopped. Ten is reachable: 4 + 3 + 3. */
check(
  "a target greedy order walks past is still reached",
  count(packEmqSets(sets(4, 4, 4, 3, 3), 10)) === 10,
  `took ${count(packEmqSets(sets(4, 4, 4, 3, 3), 10))}`
);

/* The real bank: sets of two, three and four, which is what produced
   99 questions in a paper advertised as 100. */
const realistic = sets(
  ...Array.from({ length: 40 }, (_, i) => [2, 3, 3, 4][i % 4])
);
check(
  "the bank's own set sizes make a paper of exactly fifty",
  count(packEmqSets(realistic, 50)) === 50,
  `took ${count(packEmqSets(realistic, 50))}`
);

/* Sets of three alone cannot sum to fifty, and then it should land as
   close under as possible rather than pretending. */
check(
  "where no combination reaches the target it stops just under",
  count(packEmqSets(sets(...Array(30).fill(3)), 50)) === 48,
  `took ${count(packEmqSets(sets(...Array(30).fill(3)), 50))}`
);

/* ---- never above, whatever the shape ---- */
let everOver = false;
for (let trial = 0; trial < 500; trial++) {
  const shape = Array.from(
    { length: 40 },
    () => 2 + Math.floor(Math.random() * 6)
  );
  const taken = packEmqSets(sets(...shape), 50);
  if (count(taken) > 50) everOver = true;
}
check("never above the target, over five hundred random banks", !everOver);

/* ---- whole sets, always ---- */
const groups = sets(4, 4, 4);
const takenWhole = packEmqSets(groups, 10);
check(
  "a set is taken whole or not at all",
  takenWhole.every((g) => groups.some((o) => o.length === g.length)),
  JSON.stringify(takenWhole.map((g) => g.length))
);
check(
  "so a target it cannot divide lands below it, not above",
  count(takenWhole) === 8,
  `got ${count(takenWhole)}`
);
check(
  "and it uses as much of the bank as the target allows",
  count(packEmqSets(sets(4, 4, 4), 12)) === 12
);

/* ---- it keeps looking past a set that is too big ---- */
const skipped = packEmqSets(sets(9, 2), 5);
check(
  "a set too large is skipped and a later smaller one still taken",
  count(skipped) === 2,
  `got ${count(skipped)}`
);

/* ---- edges ---- */
check("no sets, no questions", count(packEmqSets([], 50)) === 0);
check("wanting none takes none", count(packEmqSets(sets(5, 5), 0)) === 0);
check("an empty set is skipped", count(packEmqSets(sets(0, 3), 5)) === 3);
check(
  "a bank of sets all too large yields an empty EMQ half",
  count(packEmqSets(sets(10, 12), 5)) === 0
);

/* ---- the paper the brief describes ---- */
check(
  "a full paper is 50 SBAs and 50 EMQs",
  FULL_PAPER.sba === 50 && FULL_PAPER.emq === 50
);
check(
  "which is a hundred questions, not a hundred and one",
  FULL_PAPER.sba + FULL_PAPER.emq === 100
);
check(
  "in three hours, as the real paper runs",
  Math.round(paperSeconds(FULL_PAPER) / 60) === 180,
  `got ${Math.round(paperSeconds(FULL_PAPER) / 60)} minutes`
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

console.log(`
${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
