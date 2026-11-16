// Phase A of "a plan that knows the candidate" (owner, 16 November 2026): a topic is secure only on enough answers,
// and a plan that has seen no answers says it is generic instead of naming unasked topics as weak.
// Usage: npx tsx --conditions=react-server scripts/test-plan-honesty.mts
const { believedBand, buildPlanUnits, SURE_ATTEMPTS } = await import("../src/lib/performance");
const { fallbackNarrative } = await import("../src/lib/narrative");
const { buildStudyPlan } = await import("../src/lib/studyPlan");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

check("one right answer is not secure", believedBand("secure", 1) === "developing");
check(`${SURE_ATTEMPTS - 1} right answers are not yet secure`, believedBand("secure", SURE_ATTEMPTS - 1) === "developing");
check(`${SURE_ATTEMPTS} right answers are secure`, believedBand("secure", SURE_ATTEMPTS) === "secure");
check("one wrong answer stays weak", believedBand("weak", 1) === "weak");
check("developing is unchanged", believedBand("developing", 2) === "developing");

const sections = [
  { id: 1, title: "Antenatal Care", parent_id: null, priority: 1, exam: "part2", sort_order: 1, is_active: true },
  { id: 2, title: "Labour and Birth", parent_id: null, priority: 1, exam: "part2", sort_order: 2, is_active: true },
  { id: 3, title: "Contraception", parent_id: null, priority: 2, exam: "part2", sort_order: 3, is_active: true },
] as any[];
const units = buildPlanUnits(sections, [{ section_id: 2, rolling_accuracy: 100, attempts: 1, mastery: "secure" } as any]);
check("the plan reads a one-answer 100% as developing", units.find((u) => u.section_id === 2)?.band === "developing");

const today = "2026-11-16";
const nothing = buildPlanUnits(sections, []);
const plan = buildStudyPlan(today, "2027-03-10", nothing);
const generic = fallbackNarrative(plan, nothing);
check("with no answers the brief says it follows the syllabus", /follows the syllabus/.test(generic));
check("with no answers the brief names no topic as weak", !/Antenatal Care|Labour and Birth|Contraception/.test(generic));
check("with no answers the brief points to the diagnostic", /diagnostic/.test(generic));

const some = buildPlanUnits(sections, [{ section_id: 3, rolling_accuracy: 20, attempts: 5, mastery: "weak" } as any]);
const brief = fallbackNarrative(buildStudyPlan(today, "2027-03-10", some), some);
check("with answers the brief names the weak topic answered", /Contraception/.test(brief));
check("and not the topics never asked", !/Antenatal Care|Labour and Birth/.test(brief));

console.log(failed ? `${failed} failed` : "plan honesty: all passed");
if (failed) process.exit(1);
