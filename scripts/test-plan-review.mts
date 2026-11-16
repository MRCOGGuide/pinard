// Phase C (16 November 2026): review days revisit every secured and developing topic in turn, not the same four.
// Usage: npx tsx --conditions=react-server scripts/test-plan-review.mts
const { buildStudyPlan, planSnapshot } = await import("../src/lib/studyPlan");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

const band = (i: number) => (i < 12 ? "weak" : i < 24 ? "developing" : "secure");
const units = Array.from({ length: 36 }, (_, i) => ({
  section_id: i + 1, title: `Topic ${i + 1}`, accuracy: i < 12 ? 40 : i < 24 ? 60 : 80, attempts: 10,
  band: band(i) as any, priority: 1 as any,
}));
const plan = buildStudyPlan("2026-11-16", "2027-03-10", units);
const reviews = plan.weeks.flatMap((w) => w.days).filter((d) => d.kind === "review");
const reviewed = new Map<number, number>();
for (const d of reviews) for (const i of d.items) reviewed.set(i.section_id, (reviewed.get(i.section_id) ?? 0) + 1);

check("there are review days", reviews.length > 0);
check("every secured and developing topic gets a review day", units.filter((u) => u.band !== "weak").every((u) => reviewed.has(u.section_id)));
check("no weak topic takes a review day", units.filter((u) => u.band === "weak").every((u) => !reviewed.has(u.section_id)));
const counts = [...reviewed.values()];
check("reviews are shared evenly (no topic more than one ahead)", Math.max(...counts) - Math.min(...counts) <= 1);
check("secured topics come round first", reviews[0].items.every((i) => band(i.section_id - 1) === "secure"));
check("a review day still asks the daily number", reviews.every((d) => d.items.reduce((s, i) => s + i.question_target, 0) === 10));
check("plans built before this are rebuilt", planSnapshot("2027-03-10", units).startsWith("v2:"));

// Only one topic secured: it is reviewed every time, alone, rather than the day failing.
const one = units.map((u, i) => ({ ...u, band: (i === 0 ? "secure" : "weak") as any }));
const onePlan = buildStudyPlan("2026-11-16", "2027-03-10", one);
const oneReviews = onePlan.weeks.flatMap((w) => w.days).filter((d) => d.kind === "review");
check("with one secured topic each review day revisits it", oneReviews.length > 0 && oneReviews.every((d) => d.items.length === 1 && d.items[0].section_id === 1));

console.log(failed ? `${failed} failed` : "plan review days: all passed");
if (failed) process.exit(1);
