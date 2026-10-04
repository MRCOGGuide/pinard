/**
 * Does the readiness score promise what the (i) beside it says?
 *
 *   npx tsx scripts/test-readiness.mts
 *
 * The strip tells a candidate four things about this number, and they
 * are the four asserted here: everything answered correctly in every
 * topic reads 100, a topic never opened counts as a zero, seventy is
 * where it turns green rather than where it stops, and one lucky
 * answer does not secure a topic.
 *
 * The last is why the figure changed shape at all. The earlier score
 * averaged rolling accuracy over the practisable syllabus and nothing
 * else, so two topics answered well and twenty-nine never opened read
 * as a pass.
 */
import {
  readiness,
  readinessBand,
  PASS_THRESHOLD,
  SURE_ATTEMPTS,
} from "../src/lib/performance";
import type { PlanUnit } from "../src/lib/studyPlan";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

/** A unit with enough answers behind it to be believed. */
function unit(
  section_id: number,
  accuracy: number,
  attempts = SURE_ATTEMPTS,
  covered = true
): PlanUnit {
  return {
    section_id,
    title: `Topic ${section_id}`,
    accuracy,
    attempts,
    band: "weak",
    priority: 1,
    covered,
  };
}

const ten = (accuracy: number, attempts?: number) =>
  Array.from({ length: 10 }, (_, i) => unit(i + 1, accuracy, attempts));

/* ---- the promise on the tooltip ---- */

check(
  "everything right in every topic reads 100",
  readiness(ten(100)).percent === 100,
  `got ${readiness(ten(100)).percent}`
);

/* Seventy is the line, not the ceiling. The score passed the mark a
   candidate needs and then keeps going, because being ready and being
   finished are different and the last three weeks have to be worth
   something. */
check(
  "the pass mark in every topic reads 70, not 100",
  readiness(ten(PASS_THRESHOLD)).percent === PASS_THRESHOLD,
  `got ${readiness(ten(PASS_THRESHOLD)).percent}`
);
check(
  "and work above the pass mark still raises it",
  readiness(ten(95)).percent > readiness(ten(PASS_THRESHOLD)).percent
);

check(
  "nothing practised reads 0",
  readiness(ten(0, 0)).percent === 0
);

/* Two topics perfect, eight never opened. The old score read the two
   and called it 100; this reads the syllabus and calls it 20. */
const narrow = [
  unit(1, 100),
  unit(2, 100),
  ...Array.from({ length: 8 }, (_, i) => unit(i + 3, 0, 0)),
];
check(
  "a topic never opened counts as a zero",
  readiness(narrow).percent === 20,
  `got ${readiness(narrow).percent}`
);

check(
  "two perfect topics out of ten is nowhere near ready",
  readiness(narrow).percent < PASS_THRESHOLD,
  `got ${readiness(narrow).percent}`
);

/* ---- one answer is not a topic ---- */

const lucky = ten(100, 1);
check(
  "one correct answer in each topic is not readiness",
  readiness(lucky).percent === Math.round((1 / SURE_ATTEMPTS) * 100),
  `got ${readiness(lucky).percent}`
);
check(
  "and secures nothing",
  readiness(lucky).secured === 0,
  `secured ${readiness(lucky).secured}`
);
check(
  "though it does count as touched",
  readiness(lucky).touched === 10
);

/* A section holding fewer questions than the confidence floor asks
   for. Answering all three of them is everything there is to answer,
   so it must not be held back for the two that do not exist. */
const short = [unit(1, 100, 3)];
check(
  "a short section is believed once all of it is answered",
  readiness(short, new Map([[1, 3]])).percent === 100,
  `got ${readiness(short, new Map([[1, 3]])).percent}`
);
check(
  "but not when the section is long and only three were answered",
  readiness(short, new Map([[1, 40]])).percent === 60,
  `got ${readiness(short, new Map([[1, 40]])).percent}`
);

/* ---- the denominator ---- */

check(
  "sections the bank cannot serve are left out, not counted as zeroes",
  readiness([unit(1, 100), unit(2, 0, 0, false)]).percent === 100,
  "a candidate cannot practise what has not been written"
);
check(
  "an empty syllabus is 0 rather than a division by zero",
  readiness([]).percent === 0 && readiness([]).total === 0
);

/* ---- the colours ---- */

check("0 is red", readinessBand(0) === "red");
check("39 is red", readinessBand(39) === "red");
check("40 is amber", readinessBand(40) === "amber");
check("69 is amber", readinessBand(69) === "amber");
check(`${PASS_THRESHOLD} is green`, readinessBand(PASS_THRESHOLD) === "green");
check("100 is green", readinessBand(100) === "green");

/* ---- monotonic: more work never lowers the score ---- */
let previous = -1;
let monotonic = true;
for (let touched = 0; touched <= 10; touched++) {
  const units = Array.from({ length: 10 }, (_, i) =>
    i < touched ? unit(i + 1, 100) : unit(i + 1, 0, 0)
  );
  const p = readiness(units).percent;
  if (p < previous) monotonic = false;
  previous = p;
}
check("securing one more topic never lowers readiness", monotonic);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
