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
import { packEmqSets, FULL_PAPER, paperSeconds } from "../src/lib/mock";

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

/* ---- the bug, exactly ---- */
/* Nine fives and two threes. Greedy reaches 48 and the next set of
   three would make 51, which is what used to be taken. Fifty is not
   reachable from this bank at all, so 48 is the right answer and the
   point is that it is below rather than above. */
const overshoot = packEmqSets(sets(5, 5, 5, 5, 5, 5, 5, 5, 5, 3, 3), 50);
check(
  "a set that would overshoot is not taken",
  count(overshoot) <= 50,
  `took ${count(overshoot)}`
);
check(
  "and it stops just under rather than just over",
  count(overshoot) === 48,
  `took ${count(overshoot)}`
);

/* The ordinary case: ten sets of five is fifty exactly. */
check(
  "a bank that divides evenly gives the paper its full fifty",
  count(packEmqSets(sets(5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5), 50)) === 50,
  `took ${count(packEmqSets(sets(5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5), 50))}`
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

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
