// Phase C proposals 3 and 4 (owner, 16 November 2026): broad topics come round more often, and a day missed this
// week is caught up in today's session.
// Usage: npx tsx --conditions=react-server scripts/test-plan-breadth-days.mts
const { buildPlanUnits, visitsFor } = await import("../src/lib/performance");
const { buildStudyPlan, missedTopics, planSnapshot, CATCH_UP_MAX } = await import("../src/lib/studyPlan");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

check("a topic of typical size comes round once", visitsFor(1000, 1000) === 1);
check("one four times typical, twice", visitsFor(4000, 1000) === 2);
check("one nine times typical, three times", visitsFor(9000, 1000) === 3);
check("never more than three", visitsFor(100000, 1000) === 3);
check("a small topic still comes round once", visitsFor(100, 1000) === 1);
check("without facts, once", visitsFor(undefined, 1000) === 1 && visitsFor(500, 0) === 1);
check("a background topic once, whatever its size", visitsFor(9000, 1000, 3) === 1);
check("a supporting topic by its size", visitsFor(9000, 1000, 2) === 3);

// Twelve core topics; topic 1 nine times the typical size, topic 2 four times.
const sections = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1, title: `Topic ${i + 1}`, parent_id: null, priority: 1, exam: "part2", sort_order: i + 1, is_active: true,
})) as any[];
const facts = new Map(sections.map((s: any) => [s.id, s.id === 1 ? 9000 : s.id === 2 ? 4000 : 1000]));
const units = buildPlanUnits(sections, [], undefined, undefined, undefined, facts);
check("the broadest topic is marked to come round three times", units[0].visits === 3);
check("the next twice", units[1].visits === 2);
check("the rest once (no mark)", units.slice(2).every((u) => u.visits === undefined));
check("the mark rebuilds stored plans", planSnapshot("2027-03-10", units).includes(":v3"));

const plan = buildStudyPlan("2026-11-16", "2027-03-10", units);
const order = plan.weeks.flatMap((w) => w.days).filter((d) => d.kind === "study").flatMap((d) => d.items.map((i) => i.section_id));
const firstRepeat = order.findIndex((id, i) => order.indexOf(id) < i);
check("every topic is asked once before any comes round again", firstRepeat >= 12);
const count = (id: number) => order.filter((x) => x === id).length;
// The first pass is one visit each, so over the whole plan the ratios are a little under 3 and 2.
check("over the plan the broadest topic comes round more than twice as often", count(1) >= 2.3 * count(5));
check("and the next about one and a half times as often or more", count(2) >= 1.5 * count(5));
const days1 = plan.weeks.flatMap((w) => w.days).filter((d) => d.kind === "study");
check("no day asks one topic twice", days1.every((d) => new Set(d.items.map((i) => i.section_id)).size === d.items.length));

// Missed days: a plan built five days ago, kept since.
const base = buildPlanUnits(sections, [], undefined, undefined, undefined, undefined);
const old = buildStudyPlan("2026-11-11", "2027-03-10", base);
const days = old.weeks.flatMap((w) => w.days);
const today = "2026-11-16";
const day = (date: string) => days.find((d) => d.date === date)!.items.map((i) => i.section_id);
const twoDaysAgo = day("2026-11-14");
const todays = new Set(day(today));
const practised = base.map((u) => (u.section_id === twoDaysAgo[0] ? { ...u, lastPractised: "2026-11-15T09:00:00Z" } : u));
const missed = missedTopics(old, practised, today);
check(`no more than ${CATCH_UP_MAX} missed topics are taken in`, missed.length <= CATCH_UP_MAX && missed.length > 0);
check("a topic practised after its day is not missed", !missed.some((u) => u.section_id === twoDaysAgo[0]));
check("a topic on today's plan is not counted as missed", !missed.some((u) => todays.has(u.section_id)));
const allPractised = base.map((u) => ({ ...u, lastPractised: "2026-11-16T07:00:00Z" }));
check("nothing is missed when everything was practised", missedTopics(old, allPractised, today).length === 0);
check("a plan built today has no missed days", missedTopics(buildStudyPlan(today, "2027-03-10", base), base, today).length === 0);
const weekLater = missedTopics(old, base, "2026-11-30");
check("days more than a week ago are not caught up", weekLater.every((u) => days.some((d) => d.date >= "2026-11-23" && d.date < "2026-11-30" && d.items.some((i) => i.section_id === u.section_id))));
const mixedWeak = base.map((u) => ({ ...u, band: (u.section_id % 2 ? "weak" : "secure") as any }));
const weakFirst = missedTopics(old, mixedWeak, today);
check("the weakest missed topics come first", weakFirst.every((u) => u.band === "weak") || weakFirst.length === 0);

console.log(failed ? `${failed} failed` : "plan breadth and missed days: all passed");
if (failed) process.exit(1);
