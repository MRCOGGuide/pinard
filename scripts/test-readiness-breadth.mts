// Readiness as knowledge (owner, 16 November 2026): counted in facts, with easy and hard questions weighed by the
// facts they test, so "a really easy question for 5 pages" with "30+ facts" does not make a candidate look ready.
// Usage: npx tsx --conditions=react-server scripts/test-readiness-breadth.mts
const { factsTested, factsEnough, overallReadiness, testedFacts, topicReadiness } = await import("../src/lib/readiness");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};
const near = (a: number, b: number, within = 0.5) => Math.abs(a - b) < within;

check("an easy question tests one fact", factsTested(1) === 1 && factsTested(2) === 1);
check("a medium question tests two", factsTested(3) === 2);
check("a hard question tests three", factsTested(4) === 3 && factsTested(5) === 3);
check("a guideline of 5 facts needs about 4 tested", near(factsEnough(5), 3.9, 0.1));
check("a guideline of 30 facts needs about 10 tested", near(factsEnough(30), 10.2, 0.1));
check("a guideline of 1,000 facts needs about 15, not 1,000", near(factsEnough(1000), 14.8, 0.1));

// One guideline of 30 facts in one passage, with twelve easy and four hard questions on it.
type Q = { section_id: number; difficulty: number; passages: number[] };
const questions: Record<number, Q> = {};
for (let i = 1; i <= 12; i++) questions[i] = { section_id: 1, difficulty: 2, passages: [10] };
for (let i = 13; i <= 16; i++) questions[i] = { section_id: 1, difficulty: 5, passages: [10] };
const passages = { 10: { document_id: 100, facts: 30 } };
const capacity = testedFacts({ questions, passages }, new Map(Object.keys(questions).map((id) => [Number(id), true])));
const model = {
  guidelines: [{ section_id: 1, document_id: 100, facts: 30, priority: 1 as const, capacity: capacity.get("1:100")!.tested }],
  questions, passages, topicPriority: { 1: 1 as const },
};
const answers = (pairs: [number, boolean][]) => new Map(pairs);
const shown = (a: Map<number, boolean>) => topicReadiness(model, a).get(1)!.percent;

check("the owner's case: one easy question right on a 30-fact guideline shows about a tenth", near(shown(answers([[1, true]])), 100 / factsEnough(30)));
check("four hard questions right show it known", near(shown(answers([[13, true], [14, true], [15, true], [16, true]])), 100));
const easyRightHardWrong = answers([[1, true], [2, true], [3, true], [13, false], [14, false], [15, false]]);
check("easy right and hard wrong reads as a quarter known, not half", near(shown(easyRightHardWrong), 25));
check("raw accuracy there would have said half", [...easyRightHardWrong.values()].filter(Boolean).length / easyRightHardWrong.size === 0.5);

// A passage can never be credited with more facts tested than it holds.
const small = { questions: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { section_id: 2, difficulty: 1, passages: [20] }])), passages: { 20: { document_id: 200, facts: 2 } } };
check("ten easy questions on a 2-fact passage test two facts", testedFacts(small, new Map(Array.from({ length: 10 }, (_, i) => [i + 1, true]))).get("2:200")!.tested === 2);

// A guideline the bank covers thinly: its untestable part is judged by the topic, not by its two questions.
const thin = {
  guidelines: [
    { section_id: 3, document_id: 301, facts: 30, priority: 1 as const, capacity: 2 },
    { section_id: 3, document_id: 302, facts: 30, priority: 1 as const, capacity: 12 },
  ],
  questions: {
    1: { section_id: 3, difficulty: 1, passages: [31] }, 2: { section_id: 3, difficulty: 1, passages: [31] },
    ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [10 + i, { section_id: 3, difficulty: 5, passages: [32] }])),
  } as Record<number, Q>,
  passages: { 31: { document_id: 301, facts: 30 }, 32: { document_id: 302, facts: 30 } },
  topicPriority: { 3: 1 as const },
};
const thinOnly = topicReadiness(thin, answers([[1, true], [2, true]])).get(3)!.percent;
const e = factsEnough(30);
const expectedThin = ((2 / e + (1 - 2 / e) * 0.5) * 100) / 2; // the thin guideline: its own 2, then the topic's level (half) for the rest; the other guideline nothing
check("both questions on a thinly covered guideline do not make it known", near(thinOnly, expectedThin) && thinOnly < 35);
const whole = topicReadiness(thin, answers([[1, true], [2, true], [10, true], [11, true], [12, true], [13, true]])).get(3)!.percent;
check("strong across the topic, the thin guideline is given the topic's level", near(whole, 100));

// Weights: guidelines by facts and priority inside a topic; topics by priority times the square root of their facts.
const weighted = {
  guidelines: [
    { section_id: 4, document_id: 401, facts: 60, priority: 1 as const, capacity: 30 },
    { section_id: 4, document_id: 402, facts: 60, priority: 3 as const, capacity: 30 },
    { section_id: 5, document_id: 501, facts: 400, priority: 3 as const, capacity: 30 },
  ],
  questions: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { section_id: 4, difficulty: 5, passages: [41] }])) as Record<number, Q>,
  passages: { 41: { document_id: 401, facts: 60 } },
  topicPriority: { 4: 1 as const, 5: 3 as const },
};
const w = topicReadiness(weighted, answers(Array.from({ length: 10 }, (_, i) => [i + 1, true] as [number, boolean])));
check("the core guideline known, the background one not: 6 of 7", near(w.get(4)!.percent, (6 / 7) * 100));
check("a core topic of 120 facts weighs 6 x sqrt(120)", near(w.get(4)!.weight, 6 * Math.sqrt(120)));
check("a background topic of 400 facts weighs 1 x 20", near(w.get(5)!.weight, 20));

const all = overallReadiness(weighted, answers(Array.from({ length: 10 }, (_, i) => [i + 1, true] as [number, boolean])));
check("overall is the topics weighted", all.percent === Math.round(((6 * Math.sqrt(120)) * (6 / 7) * 100) / (6 * Math.sqrt(120) + 20)));
check("secured at 70%: one of two", all.secured === 1 && all.touched === 1 && all.total === 2);
check("limited to the topics asked for", overallReadiness(weighted, new Map(), new Set([4])).total === 1);
check("an answer to a question no longer in the bank is ignored", overallReadiness(model, answers([[999, true]])).touched === 0);

console.log(failed ? `${failed} failed` : "readiness as knowledge: all passed");
if (failed) process.exit(1);
