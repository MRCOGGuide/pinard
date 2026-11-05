/**
 * Counting questions by source: an EMQ set counts once however many
 * scenarios it has, and a question counts for every document it rests on.
 *
 *   npx tsx scripts/test-source-question-counts.mts
 */
import assert from "node:assert/strict";
import { questionCountsByDocument, questionTotal } from "../src/lib/source-question-counts";

const row = (id: number, format: string, status: string, docs: number[] | null, group: string | null = null) => ({ id, format, status, emq_group_id: group, source_document_ids: docs });

const counts = questionCountsByDocument([
  row(1, "sba", "approved", [10]),
  row(2, "sba", "approved", [10, 20]),
  row(3, "sba", "pending", [10]),
  row(4, "sba", "rejected", [10]),
  row(5, "emq", "approved", [10], "g1"),
  row(6, "emq", "approved", [10], "g1"),
  row(7, "emq", "approved", [10], "g1"),
  row(8, "emq", "pending", [20], "g2"),
  row(9, "emq", "pending", [20], "g2"),
  row(10, "sba", "approved", null),
  row(11, "sba", "approved", [30, 30]),
]);

assert.deepEqual(counts[10], { sba: 2, emq: 1, waiting: 1 });
assert.deepEqual(counts[20], { sba: 1, emq: 0, waiting: 1 });
assert.deepEqual(counts[30], { sba: 1, emq: 0, waiting: 0 }, "a document listed twice counts once");
assert.equal(counts[40], undefined);
assert.equal(questionTotal(counts[10]), 4);
assert.equal(questionTotal(undefined), 0);
console.log("all passed");
