// Part 7: gaps are read from what the answer says, and every figure has its source named beside it.
import assert from "node:assert/strict";
import { gapsIn, groupedGaps } from "../src/lib/ask-gaps";
import { SHORT_SEARCH_NOTE, afterShortSearch, shortSource, stripCitations, withSourceNames } from "../src/lib/chat";

const Q = "What is the dose of drug X in pregnancy?";

// The forms the closing line took in the last test set.
assert.deepEqual(gapsIn("- Not covered in the current source material: aspirin thresholds [chunk:1]; detailed fetal MCA Doppler surveillance.", Q), ["aspirin thresholds", "detailed fetal MCA Doppler surveillance"]);
assert.deepEqual(gapsIn("Timing and mode of delivery, Intrapartum and Postpartum stages are not covered in the current source material.", Q), ["Timing and mode of delivery, Intrapartum and Postpartum stages"]);
assert.deepEqual(gapsIn("Cardiovascular risk assessment is not covered in the current source material (the available passage addresses PCOS).", Q), ["Cardiovascular risk assessment"]);
assert.deepEqual(gapsIn("Not covered in these sources: management of HMB on anticoagulants.", Q), ["management of HMB on anticoagulants"]);
assert.deepEqual(gapsIn("Peripartum analgesia choices and antibiotic specifics are not covered in the current source material.", Q), ["Peripartum analgesia choices and antibiotic specifics"]);

// A refusal has only the question to say what was missing.
assert.deepEqual(gapsIn("This is not covered in the current source material.", Q), [Q]);

// An answer with no gap logs nothing, and one gap said twice is logged once.
assert.deepEqual(gapsIn("Aspirin 150 mg nightly [chunk:1].\n- Covered well.", Q), []);
assert.deepEqual(gapsIn("Not covered: x.\nNot covered in these sources: x", Q), ["x"]);

// The same gap in other capitals is one gap, the most frequent comes first,
// and a gap dealt with returns as open when it is logged again.
{
  const rows = [
    { id: 5, created_at: "2026-11-05T10:00:00Z", gap: "Aspirin Dose.", status: "open" as const },
    { id: 4, created_at: "2026-11-04T10:00:00Z", gap: "MCA Doppler", status: "open" as const },
    { id: 3, created_at: "2026-11-03T10:00:00Z", gap: "aspirin dose", status: "added" as const },
    { id: 2, created_at: "2026-11-02T10:00:00Z", gap: "Consent", status: "not_a_gap" as const },
  ];
  const g = groupedGaps(rows);
  assert.deepEqual(g.map((x) => x.gap), ["Aspirin Dose.", "MCA Doppler", "Consent"]);
  assert.deepEqual(g[0].ids, [5, 3]);
  assert.equal(g[0].times, 2);
  assert.equal(g[0].open, true);
  assert.equal(g[2].open, false);
  assert.equal(g[2].status, "not_a_gap");
}

// Source names, for every form of reference in the last test set.
const names: [string, string][] = [
  ["RCOG GTG No. 37a, 2015", "GTG 37a"],
  ["RCOG GTG No. 31, 2024", "GTG 31"],
  ["NICE guideline NG133, 2023", "NICE NG133"],
  ["NICE NG88, 2026", "NICE NG88"],
  ["NICE QS109, 2023", "NICE QS109"],
  ["TOG 2017, Issue 4", "TOG 2017"],
  ["BGCS, 2021", "BGCS 2021"],
  ["GMC, 2020", "GMC 2020"],
  ["UK GOV, 2005", "UK GOV 2005"],
  ["NHS Scotland, 2025", "NHS Scotland 2025"],
  ["A British Society for Haematology guideline. DOI: 10.1111/tme.13098, 2021", "BSH 2021"],
  ["British Society for Haematology Guideline", "BSH"],
  ["RCOG Scientific Impact Paper No. 79", "SIP 79"],
  ["RCOG Evidence-based Clinical Guideline Number 7, 2011", "RCOG Guideline 7"],
  ["BSCH. DOI: 10.1111/tme.12091 Transfusion Medicine", "BSCH"],
  ["Webster K, NMPA Project Team. Ethnic and Socio-economic Inequalities", "Webster K, NMPA Project Team"],
];
for (const [reference, short] of names) assert.equal(shortSource(reference), short);
assert.equal(shortSource("", "Some guideline"), "Some guideline");

const known: Record<string, string> = { "chunk:1": "GTG 31", "chunk:2": "NICE NG133", "aid:9": "GTG 37a" };
const named = (text: string) => withSourceNames(text, (m) => known[m]);

// Beside the figure, inside the sentence's full stop, and nothing else changes.
assert.equal(named("- Aspirin 150 mg nightly [chunk:1]."), "- Aspirin 150 mg nightly [chunk:1] (GTG 31).");
assert.equal(stripCitations(named("- Aspirin 150 mg nightly [chunk:1].")), "- Aspirin 150 mg nightly (GTG 31).");
assert.equal(named("- Enoxaparin from 28 weeks [aid:9] [chunk:2]"), "- Enoxaparin from 28 weeks [chunk:2] (NICE NG133, GTG 37a)".replace("[chunk:2]", "[aid:9] [chunk:2]"));

// Two citations of one source name it once.
assert.equal(named("Dose 75 mg [chunk:1], then 150 mg [chunk:1]."), "Dose 75 mg [chunk:1], then 150 mg [chunk:1] (GTG 31).");

// No figure, no name: the sources are listed under the answer.
assert.equal(named("- Refer to the fetal medicine team [chunk:1]."), "- Refer to the fetal medicine team [chunk:1].");

// A digit in a citation is not a figure, a heading has no citation, and an unknown source adds nothing.
assert.equal(named("Antenatal"), "Antenatal");
assert.equal(named("- Dose 5 mg [chunk:77]."), "- Dose 5 mg [chunk:77].");

// A difference between sources already names both.
const differs = "- Guidance differs: NICE NG133 advises 75 mg; RCOG GTG 31 advises 150 mg [chunk:1] [chunk:2].";
assert.equal(named(differs), differs);

// Lines stay in order and blank lines stay blank.
assert.equal(named("Booking\n\n- BMI 36 [chunk:1]."), "Booking\n\n- BMI 36 [chunk:1] (GTG 31).");

// After a failed plan an answer cannot say what the library lacks, and the reader is told why.
assert.equal(afterShortSearch("- Dose 5 mg [chunk:1].\nITP is not covered in the current source material."), `- Dose 5 mg [chunk:1].\n\n${SHORT_SEARCH_NOTE}`);
assert.equal(afterShortSearch("- Dose 5 mg [chunk:1]."), `- Dose 5 mg [chunk:1].\n\n${SHORT_SEARCH_NOTE}`);

// With nothing else to say, there is no answer.
assert.equal(afterShortSearch("This is not covered in the current source material."), "");

console.log("gaps and source names: all passed");
