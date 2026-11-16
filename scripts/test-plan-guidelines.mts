// Phase C proposals 1 and 2 (owner, 16 November 2026): weakness by guideline inside a topic, and secure only on
// enough answers for the topic's breadth.
// Usage: npx tsx --conditions=react-server scripts/test-plan-guidelines.mts
const { guidelineNeed, orderByGuidelineNeed, scoreGuidelines, weakestGuidelines } = await import("../src/lib/guidelines");
const { buildPlanUnits, readiness, sureAtFor, SURE_ATTEMPTS } = await import("../src/lib/performance");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

// The order a candidate's time should go in.
check("a guideline answered wrongly comes before one never asked", guidelineNeed({ answered: 1, correct: 0 }) < guidelineNeed(undefined));
check("one never asked comes before one answered rightly", guidelineNeed(undefined) < guidelineNeed({ answered: 1, correct: 1 }));
check("two of four comes before never asked", guidelineNeed({ answered: 4, correct: 2 }) < guidelineNeed(undefined));

// A topic of three guidelines: A answered wrongly twice, B never asked, C answered rightly three times.
const q = (id: number, doc: number, set: string | null = null) => ({ id, emq_group_id: set, source_document_ids: [doc] });
const pool = [
  q(1, 30), q(2, 30), q(3, 30), q(4, 30), // C
  q(5, 20), q(6, 20), q(7, 20), // B
  q(8, 10), q(9, 10), q(10, 10), // A
  q(11, 20, "set-b"), q(12, 20, "set-b"), q(13, 20, "set-b"), // an EMQ set from B
];
const first = new Map<number, boolean>([[8, false], [9, false], [1, true], [2, true], [3, true]]);
const ordered = orderByGuidelineNeed(pool, first);
const docOf = (id: number) => pool.find((p) => p.id === id)!.source_document_ids[0];
check("every question is kept, once", ordered.length === pool.length && new Set(ordered.map((o) => o.id)).size === pool.length);
check("the session starts in the guideline answered worst", docOf(ordered[0].id) === 10);
check("then the one never asked, then the one answered well", docOf(ordered[1].id) === 20 && docOf(ordered[2].id) === 30);
check("one guideline at a time: the first three cover all three", new Set(ordered.slice(0, 3).map((o) => docOf(o.id))).size === 3);
const setAt = ordered.findIndex((o) => o.emq_group_id === "set-b");
check("an EMQ set moves as one", ordered.slice(setAt, setAt + 3).every((o) => o.emq_group_id === "set-b"));
check("with no answers every guideline is still taken in turn", new Set(orderByGuidelineNeed(pool, new Map()).slice(0, 3).map((o) => docOf(o.id))).size === 3);

// What Progress lists.
const scores = scoreGuidelines(first, (id) => pool.find((p) => p.id === id)?.source_document_ids);
const weak = weakestGuidelines(scores);
check("Progress names the guideline answered wrongly twice", weak.length === 1 && weak[0].documentId === 10);
check("and not one answered once, or answered well", !weak.some((w) => w.documentId === 30));

// Secure needs answers for the breadth.
check("a topic of four guidelines needs five answers", sureAtFor(4) === SURE_ATTEMPTS);
check("a topic of fourteen needs fourteen", sureAtFor(14) === 14);
check("a topic of 25 needs twenty, the most the score is taken over", sureAtFor(25) === 20);
check("a topic of unknown breadth needs five", sureAtFor(undefined) === SURE_ATTEMPTS);

const sections = [
  { id: 1, title: "Antenatal Care", parent_id: null, priority: 1, exam: "part2", sort_order: 1, is_active: true },
  { id: 2, title: "Pelvic", parent_id: null, priority: 1, exam: "part2", sort_order: 2, is_active: true },
] as any[];
const breadth = new Map([[1, 25], [2, 4]]);
const perf = (section_id: number, attempts: number, rolling_accuracy: number) =>
  ({ section_id, attempts, rolling_accuracy, mastery: rolling_accuracy >= 70 ? "secure" : rolling_accuracy >= 50 ? "developing" : "weak" }) as any;
const five = buildPlanUnits(sections, [perf(1, 5, 100), perf(2, 5, 100)], undefined, undefined, breadth);
check("five right answers do not secure Antenatal Care", five.find((u) => u.section_id === 1)!.band === "developing");
check("five right answers secure Pelvic", five.find((u) => u.section_id === 2)!.band === "secure");
const twenty = buildPlanUnits(sections, [perf(1, 20, 80)], undefined, undefined, breadth);
check("twenty answers at 80% secure Antenatal Care", twenty.find((u) => u.section_id === 1)!.band === "secure");
const ready = readiness(five);
check("Progress counts Pelvic secured and not Antenatal Care", ready.secured === 1);

// A rating still gives way to answers at five, whatever the breadth.
const rated = buildPlanUnits(sections, [perf(1, 6, 90)], undefined, new Map([[1, "not_confident" as any]]), breadth);
const antenatal = rated.find((u) => u.section_id === 1)!;
check("six good answers overrule 'not confident' in a broad topic", antenatal.source === "answers" && antenatal.band === "developing");

console.log(failed ? `${failed} failed` : "plan guidelines: all passed");
if (failed) process.exit(1);
