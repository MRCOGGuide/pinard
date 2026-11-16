// Phase C proposal 5 (owner, 16 November 2026): SBA and EMQ kept apart, and sessions tilted toward the weaker.
// Usage: npx tsx --conditions=react-server scripts/test-plan-formats.mts
const { formatStanding, weakerFormat, tiltToward, FORMAT_MIN_ANSWERS, WEAKER_SHARE } = await import("../src/lib/formats");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString();
const answers = (format: "sba" | "emq", right: number, wrong: number, from: number) => [
  ...Array.from({ length: right }, (_, i) => ({ question_id: from + i, is_correct: true, answered_at: at(from + i), format })),
  ...Array.from({ length: wrong }, (_, i) => ({ question_id: from + right + i, is_correct: false, answered_at: at(from + right + i), format })),
];

const s = formatStanding([...answers("sba", 16, 4, 0), ...answers("emq", 12, 8, 100)]);
check("SBA and EMQ are counted apart", s.sba.answered === 20 && s.sba.correct === 16 && s.emq.answered === 20 && s.emq.correct === 12);
check("80% against 60%: EMQ is the weaker", weakerFormat(s) === "emq");
const retry = formatStanding([...answers("sba", 1, 0, 0), { question_id: 0, is_correct: false, answered_at: at(500), format: "sba" as const }]);
check("only the first answer to a question counts", retry.sba.answered === 1 && retry.sba.correct === 1);
check("an answer to a withdrawn question (no format) is left out", formatStanding([{ question_id: 9, is_correct: true, answered_at: at(1) }]).sba.answered === 0);
check(`no weaker kind before ${FORMAT_MIN_ANSWERS} answers of each`, weakerFormat(formatStanding([...answers("sba", 19, 0, 0), ...answers("emq", 0, 19, 100)])) === null);
check("no weaker kind when the gap is under ten points", weakerFormat(formatStanding([...answers("sba", 15, 5, 0), ...answers("emq", 14, 6, 100)])) === null);

// A topic's questions in order: alternating SBAs and EMQ sets of three.
type R = { id: number; format: "sba" | "emq"; emq_group_id: string | null };
const rows: R[] = [];
let id = 1;
for (let k = 0; k < 20; k++) {
  rows.push({ id: id++, format: "sba", emq_group_id: null });
  if (k % 2 === 0) for (let j = 0; j < 3; j++) rows.push({ id: id++, format: "emq", emq_group_id: `set-${k}` });
}
check("with no weaker kind the order is unchanged", tiltToward(rows, null) === rows);
const tilted = tiltToward(rows, "sba");
check("every question is kept, once", tilted.length === rows.length && new Set(tilted.map((r) => r.id)).size === rows.length);
const first = tilted.slice(0, 15);
const share = first.filter((r) => r.format === "sba").length / first.length;
check(`the weaker kind makes about ${Math.round(WEAKER_SHARE * 100)}% of the first fifteen`, share >= 0.55 && share <= 0.8);
const sets = new Map<string, number[]>();
tilted.forEach((r, i) => r.emq_group_id && sets.set(r.emq_group_id, [...(sets.get(r.emq_group_id) ?? []), i]));
check("an EMQ set stays together", [...sets.values()].every((ix) => ix[ix.length - 1] - ix[0] === ix.length - 1));
const towardEmq = tiltToward(rows, "emq").slice(0, 15);
check("tilted toward EMQ, EMQs lead", towardEmq.filter((r) => r.format === "emq").length / towardEmq.length >= 0.55);

console.log(failed ? `${failed} failed` : "SBA and EMQ apart: all passed");
if (failed) process.exit(1);
