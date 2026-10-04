/**
 * Is the diagnostic open when it should be, and shut when it should not?
 *
 *   npx tsx scripts/test-diagnostic-interval.mts
 *
 * It used to be open always, which is why this exists: the lock is the
 * new behaviour and the thing that can be got wrong in both
 * directions. Shut when it should be open and the one mechanism that
 * sweeps unscheduled topics is unreachable; open when it should be
 * shut and sittings stop being comparable.
 */
import {
  diagnosticAvailability,
  canSitDiagnostic,
  DIAGNOSTIC_INTERVAL_DAYS,
} from "../src/lib/diagnostic";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

const NOW = new Date("2026-10-04T09:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

check(
  "never sat: open",
  diagnosticAvailability(null, NOW).status === "never"
);
check("and nothing stops them", canSitDiagnostic(diagnosticAvailability(null, NOW)));

check(
  "sat today: shut",
  diagnosticAvailability(daysAgo(0), NOW).status === "waiting"
);
check(
  "sat yesterday: still shut",
  !canSitDiagnostic(diagnosticAvailability(daysAgo(1), NOW))
);
check(
  `one day short of ${DIAGNOSTIC_INTERVAL_DAYS}: shut`,
  diagnosticAvailability(daysAgo(DIAGNOSTIC_INTERVAL_DAYS - 1), NOW).status ===
    "waiting"
);
check(
  `exactly ${DIAGNOSTIC_INTERVAL_DAYS} days: open`,
  diagnosticAvailability(daysAgo(DIAGNOSTIC_INTERVAL_DAYS), NOW).status === "due"
);
check(
  "long overdue: open",
  canSitDiagnostic(diagnosticAvailability(daysAgo(200), NOW))
);

/* The countdown a locked page prints. Never zero, because a candidate
   told "0 days" would go and look, and never more than the interval. */
for (let sat = 0; sat < DIAGNOSTIC_INTERVAL_DAYS; sat++) {
  const a = diagnosticAvailability(daysAgo(sat), NOW);
  if (a.status !== "waiting") {
    check(`sat ${sat} days ago should be waiting`, false);
    break;
  }
  if (a.daysLeft < 1 || a.daysLeft > DIAGNOSTIC_INTERVAL_DAYS) {
    check(`days left is sane ${sat} days in`, false, `got ${a.daysLeft}`);
    break;
  }
}
check("the countdown is always between 1 and the interval", true);

check(
  "and it shortens as the days pass",
  (() => {
    const a = diagnosticAvailability(daysAgo(1), NOW);
    const b = diagnosticAvailability(daysAgo(20), NOW);
    return a.status === "waiting" && b.status === "waiting" && b.daysLeft < a.daysLeft;
  })()
);

check(
  "a corrupt date is treated as never sat, not as locked for ever",
  diagnosticAvailability("not a date", NOW).status === "never"
);

check(
  `the interval is ${DIAGNOSTIC_INTERVAL_DAYS} days, which fits a revision window several times`,
  DIAGNOSTIC_INTERVAL_DAYS >= 21 && DIAGNOSTIC_INTERVAL_DAYS <= 35
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
