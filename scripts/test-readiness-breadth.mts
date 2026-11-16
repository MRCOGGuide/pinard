// Readiness by breadth and priority (owner, 16 November 2026): "Can't expect a candidate to be ready based on 5
// questions in a 5 page guideline vs 30 pages guideline".
// Usage: npx tsx --conditions=react-server scripts/test-readiness-breadth.mts
const { answersNeeded, overallReadiness, topicReadiness, PAGES_PER_ANSWER } = await import("../src/lib/readiness");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

// Topic 1: one 5-page guideline. Topic 2: one 30-page guideline. Both core, ten questions each.
const g = (section_id: number, document_id: number, pages: number, priority: 1 | 2 | 3 = 1, available = 10) =>
  ({ section_id, document_id, pages, priority, available });
const questions: Record<number, { section_id: number; documents: number[] }> = {};
for (let i = 1; i <= 10; i++) questions[i] = { section_id: 1, documents: [101] };
for (let i = 11; i <= 20; i++) questions[i] = { section_id: 2, documents: [201] };
const model = { guidelines: [g(1, 101, 5), g(2, 201, 30)], questions, topicPriority: { 1: 1, 2: 1 } as any };
const right = (ids: number[]) => new Map(ids.map((id) => [id, true]));

check(`one answer per ${PAGES_PER_ANSWER} pages: a 5-page guideline needs one`, answersNeeded({ pages: 5, available: 10 }) === 1);
check("a 30-page guideline needs six", answersNeeded({ pages: 30, available: 10 }) === 6);
check("never more than the bank holds on it", answersNeeded({ pages: 100, available: 3 }) === 3);
check("never fewer than one", answersNeeded({ pages: 1, available: 4 }) === 1);

const five = topicReadiness(model, right([1, 2, 3, 4, 5, 11, 12, 13, 14, 15]));
check("five right answers make the 5-page guideline count in full", near(five.get(1)!.percent, 100));
check("five right answers on the 30-page guideline count for five-sixths", near(five.get(2)!.percent, (5 / 6) * 100));
const halfRight = new Map([[11, true], [12, true], [13, true], [14, false], [15, false], [16, false]]);
check("six answers, half right, on the 30-page guideline: 50%", near(topicReadiness(model, halfRight).get(2)!.percent, 50));

// Inside a topic: guidelines weighted by pages and priority; one never met counts as zero.
const mixed = {
  guidelines: [g(3, 301, 30), g(3, 302, 5), g(3, 303, 30, 3)],
  questions: Object.fromEntries([
    ...Array.from({ length: 6 }, (_, i) => [300 + i, { section_id: 3, documents: [301] }]),
    [310, { section_id: 3, documents: [302] }],
    [320, { section_id: 3, documents: [303] }],
  ]) as any,
  topicPriority: { 3: 1 } as any,
};
const onlyBig = topicReadiness(mixed, right([300, 301, 302, 303, 304, 305])).get(3)!;
// core 30 pages x6 = 180, core 5 pages x6 = 30, background 30 pages x1 = 30: shown 180 of 240.
check("the long core guideline counts by its pages and priority (75%)", near(onlyBig.percent, 75));
const onlyBackground = topicReadiness(mixed, right([320])).get(3)!;
check("the background guideline counts for little (one answer of six needed: 2%)", near(onlyBackground.percent, (30 * (1 / 6) / 240) * 100));
check("answered and needed are reported", onlyBig.answered === 6 && onlyBig.needed === 6 + 1 + 6);

// Across topics: priority times the square root of pages.
const across = {
  guidelines: [g(4, 401, 100, 1), g(5, 501, 400, 3)],
  questions: { 1: { section_id: 4, documents: [401] }, 2: { section_id: 5, documents: [501] } } as any,
  topicPriority: { 4: 1, 5: 3 } as any,
};
const t = topicReadiness(across, new Map());
check("a core topic of 100 pages weighs 6 x 10", near(t.get(4)!.weight, 60));
check("a background topic of 400 pages weighs 1 x 20", near(t.get(5)!.weight, 20));

// Overall.
const all = overallReadiness(model, right([1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16]));
check("both topics answered fully and right: 100%", all.percent === 100 && all.secured === 2 && all.touched === 2);
const partial = overallReadiness(model, right([1]));
check("only the small topic answered: secured 1, touched 1, of 2", partial.secured === 1 && partial.touched === 1 && partial.total === 2);
// weights 6 x sqrt(5) and 6 x sqrt(30): 100% on the first only.
check("and readiness is the small topic's share", partial.percent === Math.round((Math.sqrt(5) / (Math.sqrt(5) + Math.sqrt(30))) * 100));
check("limited to the topics asked for", overallReadiness(model, right([1]), new Set([1])).total === 1);
check("a question citing two guidelines counts toward both", (() => {
  const two = { ...model, questions: { ...questions, 99: { section_id: 1, documents: [101, 102] } }, guidelines: [...model.guidelines, g(1, 102, 5)] };
  const r = topicReadiness(two, right([99])).get(1)!;
  return near(r.percent, 100) && r.answered === 2;
})());
check("an answer to a question no longer in the bank is ignored", overallReadiness(model, right([999])).touched === 0);

console.log(failed ? `${failed} failed` : "readiness by breadth: all passed");
if (failed) process.exit(1);
