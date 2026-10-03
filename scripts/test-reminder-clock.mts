/**
 * Does "your 7am reminder" arrive at 7am?
 *
 *   npx tsx scripts/test-reminder-clock.mts
 *
 * Everything needed to send on a candidate's own clock was already
 * built: the zone is captured at onboarding and on the account page,
 * and the sender reads both the hour and the calendar day in it. What
 * was left is how often the sender runs. It ran once a day, at 06:00
 * UTC, and a rule of "their hour has arrived and nothing has gone
 * today" can only be true at the moment the run happens — so the single
 * run decided everyone's delivery time, whatever their zone said.
 *
 * This walks a simulated clock through two days for candidates in five
 * zones, under both schedules, and asserts what each would receive.
 */
import { isDue, localDate, localHour } from "../src/lib/reminders";

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

type Send = { day: string; localHour: number };

/** Run the sender at the given UTC hours and collect what each zone gets. */
function simulate(runHoursUtc: number[], hours = 48): Record<string, Send[]> {
  const sent: Record<string, Send[]> = {};
  for (const zone of ZONES) sent[zone] = [];

  for (let h = 0; h < hours; h++) {
    const now = new Date(START + h * 3600_000);
    if (!runHoursUtc.includes(now.getUTCHours())) continue;

    for (const zone of ZONES) {
      const theirHour = localHour(now, zone);
      const theirDay = localDate(now, zone);
      const already = sent[zone].some((s) => s.day === theirDay);
      if (
        isDue({
          reminderHour: REMINDER_HOUR,
          currentHour: theirHour,
          sentToday: already,
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
  if (condition) {
    console.log(`pass  ${name}`);
  } else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

/* ---- what a single daily run does, which is the fault ---- */
const daily = simulate([6]);
console.log("Once a day at 06:00 UTC:");
for (const zone of ZONES) {
  const hours = daily[zone].map((s) => s.localHour);
  console.log(`   ${zone.padEnd(22)} delivered at ${hours.join(", ")} local`);
}
/*
  Why both changes had to ship together. Under the old rule a single
  daily run delivered to everyone, at whatever hour that run happened
  to be in their zone — 23:00 in Los Angeles. Under the window it would
  deliver to nobody outside the band the run falls in. Either way one
  run a day cannot serve a worldwide audience, which is the whole
  finding.
*/
check(
  "one run a day leaves most zones unserved",
  ZONES.filter((z) => daily[z].length === 0).length >= 2,
  `got ${JSON.stringify(
    Object.fromEntries(ZONES.map((z) => [z, daily[z].length]))
  )}`
);

/* ---- hourly, which is the fix ---- */
const hourly = simulate(Array.from({ length: 24 }, (_, i) => i));
console.log("\nEvery hour:");
for (const zone of ZONES) {
  const hours = hourly[zone].map((s) => s.localHour);
  console.log(`   ${zone.padEnd(22)} delivered at ${hours.join(", ")} local`);
}

for (const zone of ZONES) {
  check(
    `${zone} is sent at 7 their time`,
    hourly[zone].every((s) => s.localHour === REMINDER_HOUR),
    `got ${JSON.stringify(hourly[zone])}`
  );
  check(
    `${zone} gets one a day and no more`,
    hourly[zone].length === new Set(hourly[zone].map((s) => s.day)).size &&
      hourly[zone].length >= 1,
    `got ${hourly[zone].length} over ${
      new Set(hourly[zone].map((s) => s.day)).size
    } days: ${JSON.stringify(hourly[zone])}`
  );
}

/* The window, which is what stops a catch-up becoming a bad-night email. */
check(
  "an hour inside the grace window still sends",
  isDue({ reminderHour: 7, currentHour: 9, sentToday: false, enabled: true }),
  "a cron that missed two runs should still deliver"
);
check(
  "an hour past it does not",
  !isDue({ reminderHour: 7, currentHour: 23, sentToday: false, enabled: true }),
  "23:00 is not a good morning"
);
check(
  "before their hour, nothing",
  !isDue({ reminderHour: 7, currentHour: 6, sentToday: false, enabled: true }),
  ""
);

/* A candidate who asks for a late hour still gets it on their own day. */
const late = (() => {
  const sent: Send[] = [];
  for (let h = 0; h < 48; h++) {
    const now = new Date(START + h * 3600_000);
    const zone = "Asia/Karachi";
    const theirDay = localDate(now, zone);
    if (
      isDue({
        reminderHour: 21,
        currentHour: localHour(now, zone),
        sentToday: sent.some((s) => s.day === theirDay),
        enabled: true,
      })
    ) {
      sent.push({ day: theirDay, localHour: localHour(now, zone) });
    }
  }
  return sent;
})();
check(
  "a 9pm reminder arrives at 9pm, not at midnight",
  late.every((s) => s.localHour === 21) && late.length === 2,
  JSON.stringify(late)
);

/*
  The duplicate the hourly schedule would have caused.

  The guard asks whether anything went out on the candidate's own day;
  the log used to record London's. For a zone whose date differs from
  London's at their own 7am, the row written never matched the row
  looked for, so every run inside the three-hour window sent again.
  This logs against the WRONG day on purpose and asserts the fault
  appears, so that if the log and the guard drift apart again, this
  says so.
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
  "got " + withLondonLog("Pacific/Auckland")
);
check(
  "logging against their own day sends once a day",
  hourly["Pacific/Auckland"].length ===
    new Set(hourly["Pacific/Auckland"].map((s) => s.day)).size,
  JSON.stringify(hourly["Pacific/Auckland"])
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
