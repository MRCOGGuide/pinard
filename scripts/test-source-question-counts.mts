/**
 * Counting questions by source: an EMQ set counts once however many
 * scenarios it has, and a question counts for every document it rests on.
 *
 *   npx tsx scripts/test-source-question-counts.mts
 */
import { sourceJobs } from "../src/lib/queue";
import assert from "node:assert/strict";
import { questionCountsByDocument, withCopies, questionTotal } from "../src/lib/source-question-counts";

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

assert.deepEqual({ sba: counts[10].sba, emq: counts[10].emq, waiting: counts[10].waiting }, { sba: 2, emq: 1, waiting: 1 });
assert.deepEqual({ sba: counts[20].sba, emq: counts[20].emq, waiting: counts[20].waiting }, { sba: 1, emq: 0, waiting: 1 });
assert.deepEqual({ sba: counts[30].sba, emq: counts[30].emq, waiting: counts[30].waiting }, { sba: 1, emq: 0, waiting: 0 }, "a document listed twice counts once");
assert.equal(counts[10].waitingSba + counts[10].waitingEmq, counts[10].waiting, "what is waiting is told apart by format");

// A document held twice: each copy shows everything, and a question on both counts once.
const twins = { 1: [2], 2: [1] };
assert.deepEqual(withCopies([1], twins).sort(), [1, 2]);
assert.deepEqual(withCopies([1, 2], twins).sort(), [1, 2]);
assert.deepEqual(withCopies([3], twins), [3]);
const copies = questionCountsByDocument(
  [
    { id: 1, format: "sba", status: "approved", emq_group_id: null, source_document_ids: [1] },
    { id: 2, format: "sba", status: "approved", emq_group_id: null, source_document_ids: [2] },
    { id: 3, format: "sba", status: "approved", emq_group_id: null, source_document_ids: [1, 2] },
    { id: 4, format: "emq", status: "approved", emq_group_id: "a", source_document_ids: [2] },
    { id: 5, format: "emq", status: "approved", emq_group_id: "a", source_document_ids: [1] },
  ],
  twins
);
assert.equal(copies[1].sba, 3);
assert.equal(copies[2].sba, 3);
assert.equal(copies[1].emq, 1, "one set, whichever copies its rows name");
assert.equal(copies[2].emq, 1);
assert.equal(counts[40], undefined);
assert.equal(questionTotal(counts[10]), 4);
assert.equal(questionTotal(undefined), 0);
// One press: SBAs split so several runs can share them, and one job a set.
assert.deepEqual(sourceJobs(0, 0), []);
assert.deepEqual(sourceJobs(1, 0), [{ format: "sba", target: 1 }]);
assert.deepEqual(sourceJobs(5, 0), [{ format: "sba", target: 5 }]);
assert.deepEqual(sourceJobs(7, 2), [{ format: "sba", target: 5 }, { format: "sba", target: 2 }, { format: "emq", target: 1 }, { format: "emq", target: 1 }]);
assert.equal(sourceJobs(20, 5).length, 9);
assert.equal(sourceJobs(20, 0).reduce((sum, job) => sum + job.target, 0), 20);

console.log("all passed");
