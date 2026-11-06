/**
 * What a new question is told to avoid, and how a repeat is reported.
 *
 *   npx tsx scripts/test-question-points.mts
 */
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { alreadyAskedBlock, askedPoints, isRepeatProblem, nearestPoints, pointLines, repeatProblems } from "../src/lib/question-points";

const row = (id: number, format: string, note: string | null, docs: number[], stem = `stem ${id}`) => ({
  id,
  format,
  stem,
  coverage_note: note,
  correct_key: "A",
  options: [{ key: "A", text: `answer ${id}` }],
  source_document_ids: docs,
});

const points = askedPoints(
  [
    row(1, "sba", "cord platelet threshold for daily monitoring", [10]),
    row(2, "emq", "antiemetic choice in hyperemesis", [10]),
    row(3, "emq", "antiemetic choice in hyperemesis", [10]),
    row(4, "sba", "platelet threshold before neuraxial anaesthesia", [20]),
    row(5, "sba", "fibrinogen target after delivery", [20]),
    row(6, "sba", null, [20], "A stem with no note about shoulder dystocia"),
  ],
  [10]
);

assert.equal(points[0].format, "SBA");
assert.equal(points[1].format, "EMQ");
assert.equal(points[0].answer, "answer 1");
assert.equal(points[5].point, "A stem with no note about shoulder dystocia", "a question with no note falls back on its stem");
assert.equal(askedPoints([row(7, "sba", "a point", [11])], [10, 11])[0].sameSource, true, "a copy of the source is the source");
assert.equal(askedPoints([row(7, "sba", "a point", [11])], [])[0].sameSource, false, "a run on a whole section has no source");

const near = nearestPoints(points, "the platelet count in thrombocytopenia", 10);
assert.deepEqual(near.map((p) => p.id), [1, 2, 3, 4], "all of this source, then the rest of the section that shares a word");
assert.deepEqual(nearestPoints(points, "platelet", 2).map((p) => p.id), [1, 2], "the limit holds");

assert.deepEqual(pointLines(points.slice(1, 3)), ["EMQ: antiemetic choice in hyperemesis"], "a note shared by a set is listed once");

assert.equal(alreadyAskedBlock([], false), "", "nothing asked, nothing said");
const fresh = alreadyAskedBlock(["SBA: a point"], false);
assert.ok(fresh.includes("DIFFERENT knowledge point") && fresh.includes("insufficient_source_material"));
assert.ok(fresh.includes("counts as asked for an SBA"), "the rule crosses formats");
const again = alreadyAskedBlock(["SBA: a point"], true);
assert.ok(again.includes("different view") && !again.includes("DIFFERENT knowledge point"), "exhausted: another view is allowed");
assert.ok(alreadyAskedBlock(["x".repeat(500)], false).includes("…"), "a long note is cut");

const clientSaying = (text: string, fail = false) =>
  ({
    messages: {
      create: async () => {
        if (fail) throw new Error("no answer");
        return { content: [{ type: "text", text }] };
      },
    },
  }) as unknown as Anthropic;
const asked = [{ stem: "new", answer: "a", point: "p" }];
const repeat = `Here it is: {"repeats": [{"new": 1, "existing": 1, "shared_fact": "the same fact", "different_view": true}]}`;

const found = await repeatProblems(asked, points, false, clientSaying(repeat), "model");
assert.equal(found.length, 1);
assert.equal(found[0].index, 0);
assert.ok(isRepeatProblem(found[0].problem) && found[0].problem.includes("#1"));
assert.deepEqual(await repeatProblems(asked, points, true, clientSaying(repeat), "model"), [], "another view passes once allowed");
const sameView = repeat.replace("true", "false");
assert.equal((await repeatProblems(asked, points, true, clientSaying(sameView), "model")).length, 1, "the same view never passes");
assert.deepEqual(await repeatProblems(asked, points, false, clientSaying('{"repeats": []}'), "model"), []);
assert.deepEqual(await repeatProblems(asked, points, false, clientSaying("not json"), "model"), [], "an unreadable check loses no question");
assert.deepEqual(await repeatProblems(asked, points, false, clientSaying("", true), "model"), [], "a failed check loses no question");
assert.deepEqual(await repeatProblems(asked, [], false, clientSaying(repeat), "model"), [], "nothing to compare with");

console.log("question points: all passed");
