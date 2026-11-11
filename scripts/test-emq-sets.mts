/**
 * No EMQ scenario reaches a candidate without another of its set beside
 * it (owner, 8 November 2026: "No such thing as orphan scenario").
 *
 *   npx tsx --conditions=react-server scripts/test-emq-sets.mts
 */
import assert from "node:assert/strict";
import { EMQ_MIN_SET, groupIntoItems, wholeSetsOnly } from "../src/lib/emq";
import { pickFullDiagnosticSection, type PoolQuestion } from "../src/lib/diagnostic";
import { EMQ_MIN_SCENARIOS } from "../src/lib/generation";

let passed = 0;
const check = (name: string, run: () => void) => {
  run();
  passed++;
  console.log(`pass  ${name}`);
};

type Row = { id: number; format: "sba" | "emq"; emq_group_id: string | null };
const sba = (id: number): Row => ({ id, format: "sba", emq_group_id: null });
const emq = (id: number, g: string | null): Row => ({ id, format: "emq", emq_group_id: g });

check("a set needs two scenarios, and generation writes none smaller", () => {
  assert.equal(EMQ_MIN_SET, 2);
  assert.equal(EMQ_MIN_SCENARIOS, EMQ_MIN_SET);
});

check("SBAs and sets of two or more pass, in order", () => {
  const rows = [sba(1), emq(2, "a"), emq(3, "a"), sba(4), emq(5, "b"), emq(6, "b"), emq(7, "b")];
  assert.deepEqual(wholeSetsOnly(rows).map((r) => r.id), [1, 2, 3, 4, 5, 6, 7]);
});

check("a scenario whose siblings are absent is held back, not shown alone", () => {
  const rows = [sba(1), emq(2, "a"), sba(3), emq(4, "b"), emq(5, "b")];
  assert.deepEqual(wholeSetsOnly(rows).map((r) => r.id), [1, 3, 4, 5]);
});

check("an EMQ with no set at all is held back", () => {
  assert.deepEqual(wholeSetsOnly([emq(1, null), sba(2)]).map((r) => r.id), [2]);
});

check("what is left never groups into a lone EMQ", () => {
  const rows = [emq(1, "a"), sba(2), emq(3, "b"), emq(4, "c"), emq(5, "c"), emq(6, "a")].map((r) => ({
    ...r, stem: "", options: [], correct_key: "A", lead_in: null,
  }));
  const items = groupIntoItems(wholeSetsOnly(rows));
  assert.ok(items.every((i) => i.kind === "emq_set" || i.question.format === "sba"));
  assert.deepEqual(items.map((i) => (i.kind === "emq_set" ? i.scenarios.map((s) => s.id) : [i.question.id])), [[1, 6], [2], [4, 5]]);
});

check("the full diagnostic never takes a set left with one scenario", () => {
  // The picker takes the shortest set a section has, so a one-scenario
  // "set" would have been its first choice.
  const pool: PoolQuestion[] = [
    { id: 1, sectionId: 1, format: "sba", difficulty: 1, groupId: null },
    { id: 2, sectionId: 1, format: "sba", difficulty: 5, groupId: null },
    { id: 3, sectionId: 1, format: "emq", difficulty: 3, groupId: "lone" },
    { id: 4, sectionId: 1, format: "emq", difficulty: 3, groupId: "pair" },
    { id: 5, sectionId: 1, format: "emq", difficulty: 3, groupId: "pair" },
  ];
  const ids = pickFullDiagnosticSection(pool, new Set(), () => 0.5);
  assert.deepEqual(ids.filter((id) => id >= 3).sort(), [4, 5]);
});

check("a section whose only set has one scenario gives a third SBA instead", () => {
  const pool: PoolQuestion[] = [
    { id: 1, sectionId: 1, format: "sba", difficulty: 1, groupId: null },
    { id: 2, sectionId: 1, format: "sba", difficulty: 5, groupId: null },
    { id: 6, sectionId: 1, format: "sba", difficulty: 3, groupId: null },
    { id: 3, sectionId: 1, format: "emq", difficulty: 3, groupId: "lone" },
  ];
  const ids = pickFullDiagnosticSection(pool, new Set(), () => 0.5);
  assert.equal(ids.includes(3), false);
  assert.equal(ids.length, 3);
});

console.log(`\n${passed} passed`);
