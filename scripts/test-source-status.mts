/**
 * The colours and badges on Admin > Sources.
 *
 *   npx tsx scripts/test-source-status.mts
 */
import assert from "node:assert/strict";
import { aidTone, questionTone, sourceProgress } from "../src/lib/source-status";

assert.equal(questionTone(0), "red");
assert.equal(questionTone(1), "yellow");
assert.equal(questionTone(3), "yellow");
assert.equal(questionTone(4), "green");

assert.equal(aidTone(1, true, true), "green");
assert.equal(aidTone(0, false, true), "red", "not searched yet");
assert.equal(aidTone(0, true, true), "neutral", "searched and none found");
assert.equal(aidTone(0, false, false), "neutral", "not a PDF, so it cannot be searched");

const done = { chunks: 10, facts: 5, factsChecked: true, sba: 4, emq: 4, sbaMax: false, emqMax: false, aids: 1, searched: true, pdf: true };

assert.deepEqual(sourceProgress(done), { state: "complete", missing: [] });
assert.equal(sourceProgress({ ...done, facts: 0 }).state, "complete", "a clean pass that found no facts is complete");
assert.equal(sourceProgress({ ...done, aids: 0 }).state, "complete", "searched and none found is complete");
assert.equal(sourceProgress({ ...done, aids: 0, searched: false, pdf: false }).state, "complete", "a source that cannot be searched is not held back by it");
assert.equal(sourceProgress({ ...done, sba: 1, sbaMax: true, emq: 0, emqMax: true }).state, "complete", "a small source that has reached max is complete");

assert.deepEqual(sourceProgress({ ...done, sba: 3 }), { state: "partial", missing: ["SBAs"] });
assert.deepEqual(sourceProgress({ ...done, facts: 0, factsChecked: false }), { state: "partial", missing: ["ingestion"] });
assert.equal(sourceProgress({ ...done, sba: 0, emq: 0, sbaMax: false, emqMax: false }).state, "partial", "aids alone are partly done");
assert.equal(sourceProgress({ ...done, sba: 1, emq: 0, aids: 0, searched: false }).state, "partial", "a question alone is partly done");
assert.equal(sourceProgress({ ...done, sba: 0, emq: 0, sbaMax: true, aids: 0, searched: false }).state, "partial", "tried and found nothing is not untouched");

const untouched = { ...done, sba: 0, emq: 0, aids: 0, searched: false };
assert.deepEqual(sourceProgress(untouched), { state: "none", missing: ["SBAs", "EMQ sets", "decision aids"] });
assert.equal(sourceProgress({ ...done, chunks: 0, facts: 0, factsChecked: false }).state, "none", "not ingested at all");

console.log("source status: all passed");
