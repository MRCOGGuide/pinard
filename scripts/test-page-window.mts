/**
 * The page numbers a pager offers.
 *
 * 1,200 approved questions at ten a page is 120 pages, so the row has
 * to elide. What it must never do is hide the ends — page 1 and the
 * last page stay one click away wherever you are.
 *
 *   npx tsx scripts/test-page-window.mts
 */

import { pageWindow } from "../src/components/ui";

type Case = { name: string; current: number; total: number; expect: (number | "gap")[] };

const cases: Case[] = [
  { name: "nothing to page", current: 1, total: 0, expect: [] },
  { name: "a single page", current: 1, total: 1, expect: [1] },
  { name: "few enough to show them all", current: 2, total: 4, expect: [1, 2, 3, 4] },
  {
    name: "at the start of a long run",
    current: 1,
    total: 120,
    expect: [1, 2, "gap", 120],
  },
  {
    name: "in the middle of a long run",
    current: 60,
    total: 120,
    expect: [1, "gap", 59, 60, 61, "gap", 120],
  },
  {
    name: "at the end of a long run",
    current: 120,
    total: 120,
    expect: [1, "gap", 119, 120],
  },
  {
    name: "a gap of exactly one shows the number instead",
    current: 4,
    total: 6,
    expect: [1, 2, 3, 4, 5, 6],
  },
];

let failed = 0;
for (const c of cases) {
  const got = pageWindow(c.current, c.total);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${c.name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(c.expect)}`);
    console.log(`        got      ${JSON.stringify(got)}`);
  }
}

// The ends must be reachable from anywhere, and the row must stay short.
let widest = 0;
for (let total = 1; total <= 200; total++) {
  for (let current = 1; current <= total; current++) {
    const w = pageWindow(current, total);
    const numbers = w.filter((x) => x !== "gap");
    if (!numbers.includes(1) || !numbers.includes(total)) {
      console.log(`FAIL  page ${current} of ${total} cannot reach an end`);
      failed++;
    }
    if (w.includes(current) === false) {
      console.log(`FAIL  page ${current} of ${total} does not include itself`);
      failed++;
    }
    widest = Math.max(widest, w.length);
  }
}
console.log(`pass  every page reaches both ends; widest row is ${widest} entries`);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
