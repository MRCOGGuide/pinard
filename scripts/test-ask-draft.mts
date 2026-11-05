/**
 * Reading an answer while it is being written: only lines that have
 * ended come out, whatever point the JSON has reached.
 *
 *   npx tsx scripts/test-ask-draft.mts
 */
import assert from "node:assert/strict";
import { draftLines } from "../src/lib/ask-draft";

// Nothing yet.
assert.deepEqual(draftLines(""), []);
assert.deepEqual(draftLines('{"rep'), []);

// A line that has not ended is held back.
assert.deepEqual(draftLines('{"reply":"Investigations\\n- FBC [chunk:1].\\n- Ultras'), ["Investigations", "- FBC [chunk:1]."]);

// The reply's last line comes out when the string closes.
assert.deepEqual(draftLines('{"reply":"Aspirin 150 mg at night [chunk:2]."'), ["Aspirin 150 mg at night [chunk:2]."]);

// Escapes, including one cut in half by the end of a piece.
assert.deepEqual(draftLines('{"reply":"A \\"quoted\\" word\\n- 5 \\u2265 3\\nnext\\'), ['A "quoted" word', "- 5 ≥ 3"]);
assert.deepEqual(draftLines('{"reply":"First\\n\\nSecond\\nThi'), ["First", "Second"]);

// A scenario's risks come first, each once it has been written in full.
const scenario = '{"risks_to_mother":[{"risk":"VTE [chunk:1]","managed_in":"Antenatal"},{"risk":"PPH","managed_in":"Intra';
assert.deepEqual(draftLines(scenario), ["Risks to the mother", "- VTE [chunk:1]", "- PPH"]);
const both = '{"risks_to_mother":[{"risk":"VTE","managed_in":"Antenatal"}],"risks_to_baby":[{"risk":"FGR","managed_in":"Antenatal"}],"reply":"Booking\\n- Bloods.\\n';
assert.deepEqual(draftLines(both), ["Risks to the mother", "- VTE", "Risks to the baby", "- FGR", "Booking", "- Bloods."]);
assert.deepEqual(draftLines('{"risks_to_mother":[{"risk":"Hal'), []);

// Lines only ever grow, so a caller can count how many it has seen.
const whole = '{"reply":"One\\nTwo\\nThree"}';
let seen = 0;
for (let i = 0; i <= whole.length; i++) {
  const n = draftLines(whole.slice(0, i)).length;
  assert.ok(n >= seen, `lines went back at ${i}`);
  seen = n;
}
assert.equal(seen, 3);

console.log("all passed");
