/**
 * Does everyone get exactly one reminder a day?
 *
 *   npx tsx scripts/test-reminder-clock.mts
 *
 * Two things have to hold whatever the schedule is, and they are the
 * two this asserts first: nobody is dropped, and nobody is sent twice
 * on their own day. What the schedule decides is only WHEN it arrives.
 *
 * The schedule and the grace window are one decision, so this reads
 * the window from the code and checks the pair that follows from it:
 *
 *   24 hours  the sender runs once a day. Everyone is reached, at
 *             whatever hour that single run falls in their zone. The
 *             window has to be this wide, or most of the world is
 *             never found at or past its hour and is sent nothing.
 *
 *   3 hours   the sender runs hourly. Every zone gets its own 07:00,
 *             and a missed run can still catch up until ten.
 *
 * The hourly pair is what is in force: the sender is the scheduled
 * GitHub Action in .github/workflows/reminders.yml, which runs every
 * hour and is free on a public repository. It is NOT a Vercel cron,
 * where an hourly schedule needs a paid plan and asking for one
 * without it had every deployment rejected for a day. That is why the
 * schedule and the window are checked together here rather than
 * separately.
 */
import {
  isDue,
  localDate,
  localHour,
  REMINDER_GRACE_HOURS,
} from "../src/lib/reminders";

const ZONES = [
  "Europe/London",
  "Asia/Karachi",
  "Africa/Lagos",
  "America/Los_Angeles",
  "Pacific/Auckland",
];

const REMINDER_HOUR = 7;
/** A Wednesday in October, so nothing turns on a DST boundary. */
const START = Date.UTC(2026, 9, 7, 0, 0, 0);
/** What a single daily Vercel cron looked like, kept for the contrast. */
const DAILY_RUN_UTC = [6];
const HOURLY_RUNS_UTC = Array.from({ length: 24 }, (_, i) => i);

const hourly = REMINDER_GRACE_HOURS <= 12;
const runsAt = hourly ? HOURLY_RUNS_UTC : DAILY_RUN_UTC;

type Send = { day: string; localHour: number };

/**
 * Run the sender at the given UTC hours over three days and collect
 * what each zone receives, logging each send against the candidate's
 * OWN day, which is what the sender does.
 */
function simulate(runHoursUtc: number[]): Record<string, Send[]> {
  const sent: Record<string, Send[]> = {};
  for (const zone of ZONES) sent[zone] = [];

  for (let h = 0; h < 72; h++) {
    const now = new Date(START + h * 3600_000);
    if (!runHoursUtc.includes(now.getUTCHours())) continue;

    for (const zone of ZONES) {
      const theirHour = localHour(now, zone);
      const theirDay = localDate(now, zone);
      if (
        isDue({
          reminderHour: REMINDER_HOUR,
          currentHour: theirHour,
          sentToday: sent[zone].some((s) => s.day === theirDay),
          enabled: true,
        })
      ) {
        sent[zone].push({ day: theirDay, localHour: theirHour });
      }
    }
  }
  return sent;
}

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

console.log(
  `Configured: ${hourly ? "hourly" : "once a day at 06:00 UTC"}, grace ${REMINDER_GRACE_HOURS}h\n`
);

const sent = simulate(runsAt);
for (const zone of ZONES) {
  console.log(
    `   ${zone.padEnd(22)} ${sent[zone].map((s) => s.localHour).join(", ")} local`
  );
}
console.log();

/* ---- true under either schedule ---- */
for (const zone of ZONES) {
  check(
    `${zone} is reached`,
    sent[zone].length >= 2,
    `got ${sent[zone].length} over three days`
  );
  check(
    `${zone} is never sent twice on one of its own days`,
    sent[zone].length === new Set(sent[zone].map((s) => s.day)).size,
    JSON.stringify(sent[zone])
  );
}

/* ---- what the configured pair promises ---- */
if (hourly) {
  for (const zone of ZONES) {
    check(
      `${zone} is sent at ${REMINDER_HOUR} their own time`,
      sent[zone].every((s) => s.localHour === REMINDER_HOUR),
      JSON.stringify(sent[zone])
    );
  }
  check(
    "an hour past the window does not send",
    !isDue({ reminderHour: 7, currentHour: 23, sentToday: false, enabled: true }),
    "23:00 is not a good morning"
  );
} else {
  /*
    The cost of a daily run, stated rather than hidden: the hour is
    wrong for most of the world. A narrower window would not fix that,
    it would only drop those people from the run altogether.
  */
  const wrongHour = ZONES.filter((z) =>
    sent[z].some((s) => s.localHour !== REMINDER_HOUR)
  );
  check(
    "a daily run reaches everyone, at the right hour only in some zones",
    wrongHour.length > 0 && ZONES.every((z) => sent[z].length >= 2),
    `at the wrong hour: ${wrongHour.join(", ")}`
  );
  check(
    "and lateness is uncapped, or those zones would get nothing",
    isDue({ reminderHour: 7, currentHour: 23, sentToday: false, enabled: true }),
    "with a daily cron this must stay true"
  );
}

check(
  "before their hour, nothing",
  !isDue({ reminderHour: 7, currentHour: 6, sentToday: false, enabled: true })
);

/*
  The duplicate the schedule change exposed. The guard asks whether
  anything went out on the candidate's own day; the log used to record
  London's, so for a zone whose date differs from London's at their own
  hour the row written never matched the row looked for. Harmless once
  a day, four emails a morning the moment the sender runs hourly. This
  logs against the WRONG day on purpose and asserts the fault appears.
*/
function withLondonLog(zone: string): number {
  const logged: string[] = [];
  let delivered = 0;
  for (let h = 0; h < 24; h++) {
    const now = new Date(START + h * 3600_000);
    const theirDay = localDate(now, zone);
    if (
      isDue({
        reminderHour: REMINDER_HOUR,
        currentHour: localHour(now, zone),
        sentToday: logged.includes(theirDay),
        enabled: true,
      })
    ) {
      delivered += 1;
      logged.push(localDate(now, "Europe/London"));
    }
  }
  return delivered;
}

check(
  "logging against London's day would send repeatedly in one morning",
  withLondonLog("Pacific/Auckland") > 1,
  `got ${withLondonLog("Pacific/Auckland")}`
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
