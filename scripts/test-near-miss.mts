/**
 * Near misses mended rather than discarded, retries told every fault so
 * far, and a reply with words after its JSON still read (November 2026).
 *
 *   npx tsx --conditions=react-server scripts/test-near-miss.mts
 */
import assert from "node:assert/strict";
import { attemptContent, extractJson, isMendable, isMendableList, patchOptions, withPreviousProblems } from "../src/lib/generation";
import { unexpandedAbbreviations } from "../src/lib/abbreviations";

let passed = 0;
const check = (name: string, run: () => void) => {
  run();
  passed++;
  console.log(`pass  ${name}`);
};

// Real faults from the failure log.
const abbrev = '"STV" is never written out: give it in full on first use with the short form in brackets after it, then the short form alone';
const long = 'option D runs to 13 words: an option is an item, not a sentence ("CTG followed by USS for EFW, amniotic fluid volume and umbilical artery Doppler")';
const advice = 'option E is an instruction to counsel rather than a clinical item: "Reassure and return to routine antenatal care"';
const grounding = "not grounded: The passages provided contain no flow diagram";
const figure = 'the explanation states "0.9%", which no cited passage contains: cite the passage it came from, or take it out';

check("wording faults alone are mendable", () => {
  assert.equal(isMendable([abbrev]), true);
  assert.equal(isMendable([long, advice, abbrev]), true);
});
check("anything about the medicine is not", () => {
  assert.equal(isMendable([abbrev, grounding]), false);
  assert.equal(isMendable([figure]), false);
  assert.equal(isMendable([]), false);
});
check("an EMQ set is mended only in its list", () => {
  assert.equal(isMendableList([long, advice]), true);
  assert.equal(isMendableList([long, abbrev]), false);
  assert.equal(isMendableList([`scenario 2: ${grounding}`]), false);
});

const options = [
  { key: "A", text: "Steroids" },
  { key: "B", text: "Reassure and return to routine antenatal care" },
  { key: "C", text: "Delivery" },
];
check("a mend rewords options by letter and keeps the rest", () => {
  assert.deepEqual(patchOptions(options, [{ key: "B", text: "Routine antenatal care" }]), [
    { key: "A", text: "Steroids" },
    { key: "B", text: "Routine antenatal care" },
    { key: "C", text: "Delivery" },
  ]);
});
check("a mend that names a letter the list lacks is refused", () => {
  assert.equal(patchOptions(options, [{ key: "D", text: "New" }]), null);
  assert.equal(patchOptions(options, [{ key: "B", text: "  " }]), null);
});
check("a reply with no options leaves the list alone", () => {
  assert.deepEqual(patchOptions(options, undefined), options);
});

check("words after the JSON no longer sink a reply", () => {
  const raw = '{"stem": "x", "options": []}\n\nI have checked every option against the passages.';
  assert.equal(JSON.parse(extractJson(raw)).stem, "x");
});
check("words before it still do not", () => {
  assert.equal(JSON.parse(extractJson('Looking at the passages, here it is:\n{"a": 1}')).a, 1);
});
check("braces and escaped quotes inside strings are not counted", () => {
  const raw = '```json\n{"stem": "a {brace} and a \\"quote\\" }", "n": {"m": 2}}\n```\nDone.';
  const parsed = JSON.parse(extractJson(raw));
  assert.equal(parsed.n.m, 2);
  assert.equal(parsed.stem, 'a {brace} and a "quote" }');
});
check("a reply cut short is left for the parser to reject", () => {
  assert.throws(() => JSON.parse(extractJson('{"stem": "x", "options": [')));
});

const message = "SOURCE PASSAGES:\n" + "Offer aspirin 150 mg at night from 12 weeks. ".repeat(400);
check("the first retry reads exactly as it did", () => {
  assert.equal(
    withPreviousProblems("M", [long]),
    `M\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY THE VERIFIER:\n- ${long}\n\nWrite a fresh response that fixes every one of these. Do not defend the previous attempt or comment on it, just produce a correct one.`
  );
});
check("a later retry is told every fault so far", () => {
  const text = withPreviousProblems("M", [long, abbrev], 2);
  assert.match(text, /PREVIOUS ATTEMPTS WERE REJECTED/);
  assert.ok(text.includes(long) && text.includes(abbrev));
});
check("the cached part is unchanged by the running list", () => {
  const out = attemptContent(message, [long, abbrev], "claude-sonnet-4-6", 2);
  assert.ok(Array.isArray(out) && out[0].text === message && Boolean(out[0].cache_control));
  assert.ok(Array.isArray(out) && out.map((b) => b.text).join("") === withPreviousProblems(message, [long, abbrev], 2));
});

check("ITP and cCTG are everyday now; STV is not", () => {
  assert.deepEqual(unexpandedAbbreviations("A woman with ITP has a cCTG at 30 weeks; the STV is 3.1 ms."), ["STV"]);
});
check("a trial and a score are names", () => {
  assert.deepEqual(unexpandedAbbreviations("The TRUFFLE study used cCTG; her PUQE score is 14."), []);
});

console.log(`\n${passed} passed`);

// Owner, 8 November 2026: no guidance named in a stem.
import { guidanceNamedProblems } from "../src/lib/generation";
check("a stem that leans on a college is caught", () => {
  for (const stem of [
    "According to RCOG guidance, what is the appropriate next step?",
    "What does NICE recommend for her?",
    "In line with current NICE guidance, which test is offered?",
    "As per the guideline, when should she give birth?",
  ]) assert.equal(guidanceNamedProblems(stem).length, 1, stem);
});
check("ordinary clinical words are not", () => {
  for (const stem of [
    "LMWH was started under the guidance of the haematology team.",
    "She meets the WHO definition of postpartum haemorrhage.",
    "Following WHO criteria, the diagnosis is pre-eclampsia.",
    "What is the appropriate next step?",
  ]) assert.equal(guidanceNamedProblems(stem).length, 0, stem);
});
check("naming the guidance is a wording fault a mend can take", () => {
  assert.equal(isMendable([guidanceNamedProblems("According to RCOG guidance, what next?")[0]]), true);
});
console.log(`\n${passed} passed in all`);
