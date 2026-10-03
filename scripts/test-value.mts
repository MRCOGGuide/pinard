/**
 * The arithmetic the pricing page prints.
 *
 *   npx tsx scripts/test-value.mts
 *
 * These are claims about money on a page that asks for money, so they
 * are computed from the live prices and checked here. The figures in
 * the launch review — annual saves 51% against monthly, quarterly is
 * about 44p a day — are the current prices' answers, and this is where
 * that is established rather than asserted.
 */
import {
  formatPerDay,
  pencePerDay,
  savingAgainstMonthly,
  timesTheResit,
  formatGBP,
} from "../src/lib/value";

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}\n      got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    failed += 1;
  }
}

/* Today's prices. */
const MONTHLY = 1699;
const QUARTERLY = 3999;
const ANNUAL = 9999;

check("annual against monthly", savingAgainstMonthly(ANNUAL, "annual", MONTHLY), 51);
check("quarterly against monthly", savingAgainstMonthly(QUARTERLY, "quarterly", MONTHLY), 22);
check("monthly saves nothing against itself", savingAgainstMonthly(MONTHLY, "monthly", MONTHLY), null);
check(
  "a longer cycle priced higher claims no saving",
  savingAgainstMonthly(9999, "quarterly", 1000),
  null
);
check("no monthly price, no comparison", savingAgainstMonthly(ANNUAL, "annual", undefined), null);

check("quarterly per day", formatPerDay(QUARTERLY, "quarterly"), "44p a day");
check("annual per day", formatPerDay(ANNUAL, "annual"), "27p a day");
check("monthly per day", formatPerDay(MONTHLY, "monthly"), "56p a day");
check("a day over a pound reads as pounds", formatPerDay(50000, "monthly"), "£16.43 a day");
/* A quarter is a quarter of a year, not three times thirty days: at 90
   days the figure reads 44p too, and at 92 it reads 43p. The year is
   the only length that cannot drift. */
check("a quarter is 91.3 days", Math.round(pencePerDay(QUARTERLY, "quarterly") * 10) / 10, 43.8);

/* The resit, when the owner has set a fee. */
check("a resit at £420 against the annual", timesTheResit(ANNUAL, 42000), 4);
check("against the quarterly", timesTheResit(QUARTERLY, 42000), 10);
check("no fee set, no claim", timesTheResit(ANNUAL, undefined), null);
check("a fee that is not several times over is not an argument", timesTheResit(ANNUAL, 15000), null);

check("money drops a trailing .00", formatGBP(9900), "£99");
check("money keeps real pence", formatGBP(9999), "£99.99");

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
