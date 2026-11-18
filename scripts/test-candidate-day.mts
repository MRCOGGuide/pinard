// "Today" is the candidate's own day, in their own zone (pre-launch review, 18 November 2026).
// Usage: npx tsx --conditions=react-server scripts/test-candidate-day.mts
const { localDay } = await import("../src/lib/timezone");
const { missedDays, practisedDay } = await import("../src/lib/studyPlan");
const { currentStreak } = await import("../src/lib/performance");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

// 20:30 UTC on 19 November is 02:00 on 20 November in India and 00:30 on the 20th in Dubai.
const late = "2026-11-19T20:30:00Z";
check("India: the 20th", localDay("Asia/Kolkata", late) === "2026-11-20");
check("Dubai: the 20th", localDay("Asia/Dubai", late) === "2026-11-20");
check("London: still the 19th", localDay("Europe/London", late) === "2026-11-19");
check("no zone: London", localDay(null, late) === "2026-11-19");
check("a zone that does not exist: London", localDay("Not/AZone", late) === "2026-11-19");
check("practised day in India", practisedDay(late, "Asia/Kolkata") === "2026-11-20");
check("practised day without a zone is the UTC day", practisedDay(late) === "2026-11-19");

// A plan day on the 20th, its topic answered at 02:00 India time on the 20th.
const plan = {
  meta: { exam_date: "2027-03-10", generated_on: "2026-11-20", days_remaining: 100, snapshot: "" },
  weeks: [{ week_number: 0, days: [{ date: "2026-11-20", kind: "study" as const, items: [{ section_id: 1, title: "Topic 1", question_target: 10 }] }] }],
  totals: { study_days: 1, review_days: 0, mixed_days: 0, sections: 1 },
};
const units = [{ section_id: 1, title: "Topic 1", band: "weak" as const, accuracy: 0, priority: 1 as const, lastPractised: late }];
check("India: the 20th's topic, done on the 20th, is not missed", missedDays(plan, units, "2026-11-21", "Asia/Kolkata").length === 0);
check("read in UTC it would have been missed", missedDays(plan, units, "2026-11-21").length === 1);

// Streak: answers late on the 18th and 19th UTC are the 19th and 20th in India.
const answers = ["2026-11-18T20:30:00Z", late];
check("India: a two-day streak on the 20th", currentStreak(answers, "2026-11-20", "Asia/Kolkata") === 2);
check("India: still two on the 21st (today not yet started)", currentStreak(answers, "2026-11-21", "Asia/Kolkata") === 2);
check("India: none on the 22nd", currentStreak(answers, "2026-11-22", "Asia/Kolkata") === 0);

console.log(failed ? `${failed} failed` : "candidate day: all passed");
if (failed) process.exit(1);
