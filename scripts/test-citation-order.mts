/**
 * Which passage a candidate reads first.
 *
 *   npx tsx scripts/test-citation-order.mts
 *
 * A question's citations live in two places and are usually the same
 * list. Where they differ — a repair that widened an explanation's
 * citations without touching the row's, which is most of the repairs
 * in this bank — the explanation on screen was written against its own,
 * and that is what the reader is checking against. So those lead.
 */
import { citationOrder } from "../src/lib/citations";

let failed = 0;
function check(name: string, got: number[], want: number[]) {
  const same =
    got.length === want.length && got.every((v, i) => v === want[i]);
  if (same) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got [${got}], want [${want}]`);
    failed += 1;
  }
}

check("the usual case: one list, said twice", citationOrder([7, 8], [7, 8]), [7, 8]);
check("the answer's citations lead", citationOrder([3851, 3852], [16771]), [3851, 3852, 16771]);
check("no duplicates when the lists overlap", citationOrder([16771, 3851], [3851, 16771]), [16771, 3851]);
check("an explanation with none falls back to the row's", citationOrder(undefined, [12, 13]), [12, 13]);
check("a row with none is no obstacle", citationOrder([12], undefined), [12]);
check("nothing cited is an empty list, not a throw", citationOrder(undefined, undefined), []);
/* The row's column has held a stray null before now. */
check(
  "a malformed id is dropped rather than fetched",
  citationOrder([1, NaN, 2], [Infinity, 3]),
  [1, 2, 3]
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
