// Phase B of "a plan that knows the candidate" (owner, 16 November 2026): the plan follows the candidate's own
// ratings until their answers speak, checks the topics they called confident early, overrides a rating the answers
// contradict, and asks the questions a day they said they have time for.
// Usage: npx tsx --conditions=react-server scripts/test-plan-confidence.mts
const { buildPlanUnits, confidenceOverridden, SURE_ATTEMPTS } = await import("../src/lib/performance");
const { buildStudyPlan, planSnapshot, weightedSessionAllocation } = await import("../src/lib/studyPlan");
const { fallbackNarrative } = await import("../src/lib/narrative");
const { dailyQuestionsFor, isWeeklyHours, DEFAULT_DAILY } = await import("../src/lib/confidence");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

const titles = [
  "Antenatal Care", "Labour and Birth", "Contraception", "Menopause", "Gynaecological Oncology",
  "Early Pregnancy", "Subfertility", "Urogynaecology", "Maternal Medicine",
];
const sections = titles.map((title, i) => ({
  id: i + 1, title, parent_id: null, priority: 1, exam: "part2", sort_order: i + 1, is_active: true,
})) as any[];
const perf = (section_id: number, rolling_accuracy: number, attempts: number, mastery: string) =>
  ({ section_id, rolling_accuracy, attempts, mastery }) as any;

// Where each topic stands.
const ratings = new Map<number, any>([
  [1, "not_confident"], [2, "unsure"], [3, "confident"], [4, "confident"], [5, "confident"], [6, "not_confident"],
]);
const units = buildPlanUnits(
  sections,
  [
    perf(4, 33, 3, "weak"), // called confident, three answers mostly wrong
    perf(5, 60, SURE_ATTEMPTS, "developing"), // called confident, enough answers below the pass mark
    perf(6, 100, SURE_ATTEMPTS, "secure"), // called not confident, answers say secure
  ],
  undefined,
  ratings
);
const unit = (id: number) => units.find((u) => u.section_id === id)!;
check("not confident and unanswered is weak, on the rating", unit(1).band === "weak" && unit(1).source === "rating");
check("unsure and unanswered is developing", unit(2).band === "developing" && unit(2).source === "rating");
check("confident and unanswered is secure, to be confirmed", unit(3).band === "secure" && unit(3).confirm === true);
check("confident but three answers mostly wrong is weak, on the answers", unit(4).band === "weak" && unit(4).source === "answers");
check(`confident but ${SURE_ATTEMPTS} answers below the pass mark is developing`, unit(5).band === "developing" && unit(5).source === "answers");
check("not confident but answers say secure is secure", unit(6).band === "secure" && unit(6).source === "answers");
check("unrated and unanswered is weak and unknown", unit(7).band === "weak" && unit(7).source === "unknown");
const over = confidenceOverridden(units).map((u) => u.section_id).sort();
check("the overridden ratings are the two confident topics answered poorly", JSON.stringify(over) === "[4,5]");

// The plan: the topics they are least sure of first, and the confident ones checked early.
const today = "2026-11-16";
const rated = buildPlanUnits(sections, [], undefined, new Map<number, any>([
  [1, "confident"], [2, "confident"], [3, "unsure"], [4, "unsure"], [5, "not_confident"],
  [6, "confident"], [7, "unsure"], [8, "not_confident"], [9, "unsure"],
]));
const plan = buildStudyPlan(today, "2027-05-10", rated);
const studyDays = plan.weeks.flatMap((w) => w.days).filter((d) => d.kind === "study");
const firstDay = studyDays[0].items.map((i) => i.section_id);
check("the first day starts with a topic rated not confident", firstDay[0] === 5 || firstDay[0] === 8);
const order = studyDays.flatMap((d) => d.items.map((i) => i.section_id));
check("a confident topic is asked by the second study day", studyDays.slice(0, 2).some((d) => d.items.some((i) => [1, 2, 6].includes(i.section_id))));
const firstRepeat = order.findIndex((id, i) => order.indexOf(id) < i);
check("every confident topic is asked before any topic comes round again", [1, 2, 6].every((id) => order.indexOf(id) < firstRepeat));
check("confident topics are spread through the first pass, not left to its end", order.indexOf(1) < order.indexOf(7));
check("not confident topics come before unsure ones", order.indexOf(8) < order.indexOf(3));

// Questions a day.
const dayTotal = (p: any) => p.weeks.flatMap((w: any) => w.days).map((d: any) => d.items.reduce((s: number, i: any) => s + i.question_target, 0));
check("by default every day asks ten", dayTotal(plan).every((n: number) => n === DEFAULT_DAILY));
const twenty = buildStudyPlan(today, "2027-05-10", rated, 20);
check("with time for twenty every day asks twenty", dayTotal(twenty).every((n: number) => n === 20));
check("a changed daily figure rebuilds the plan", planSnapshot("2027-05-10", rated, 20) !== planSnapshot("2027-05-10", rated));
check("the default snapshot keeps its old form", !planSnapshot("2027-05-10", rated).includes("|d"));
check("no hours given is ten a day", dailyQuestionsFor(null) === 10);
check("up to 3 hours is ten a day", dailyQuestionsFor(2) === 10);
check("5 to 8 hours is twenty a day", dailyQuestionsFor(6) === 20);
check("more than 12 hours is forty a day", dailyQuestionsFor(14) === 40);
check("an unlisted figure takes the nearest", dailyQuestionsFor(7) === 20);
check("only the listed hours are accepted", isWeeklyHours(6) && !isWeeklyHours(7) && !isWeeklyHours("6"));

// The session: a topic rated not confident outweighs one rated confident, before either is answered.
const alloc = weightedSessionAllocation(rated, 20);
const count = (id: number) => alloc.find((a) => a.section_id === id)?.count ?? 0;
check("the session sums to its size", alloc.reduce((s, a) => s + a.count, 0) === 20);
check("not confident gets more questions than confident", count(5) > count(1));
check("unsure gets more than confident", count(3) > count(1));

// The brief, before any answer.
const brief = fallbackNarrative(plan, rated);
check("the brief says it follows their ratings", /how confident you said you feel/.test(brief));
check("the brief names the topics rated not confident", /Gynaecological Oncology/.test(brief) && /Urogynaecology/.test(brief));
check("the brief does not name a confident topic as needing work", !/Antenatal Care|Labour and Birth/.test(brief));

console.log(failed ? `${failed} failed` : "plan confidence: all passed");
if (failed) process.exit(1);
