/**
 * The three checks added after a clinician read the queue.
 *
 *   npx tsx scripts/test-question-rules.mts
 *
 * Each exists because a rule in the prompt was not obeyed and nothing
 * downstream noticed. A prompt rule is a request; a verifier check is
 * the thing that makes it true. These are the checks, and the point of
 * testing them is that they must refuse the real faults without
 * refusing the ordinary questions around them.
 */
import {
  ratioInQuestionProblems,
  answerInStemProblems,
  optionSentenceProblems,
} from "../src/lib/generation";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

/* ---- a ratio in what is asked ----

   The agreed rule: the RR and its interval are taught in the
   explanation and kept out of the question. This check is only ever
   given the stem and the options, so the tests are written that way. */

check(
  "a stem asking for the relative risk is refused",
  ratioInQuestionProblems(
    "What is the best estimate of the relative risk of third- and fourth-degree tears with a warm compress?"
  ).length === 1
);
check(
  "an option list of point estimates is refused",
  ratioInQuestionProblems(["RR 0.48", "RR 0.81", "RR 1.02"].join("\n")).length === 1,
  "decimal-place recall, which is what the rule exists to stop"
);
check(
  "an odds ratio named in words in the stem is caught",
  ratioInQuestionProblems("The odds ratio for preterm birth is closest to which value?").length === 1
);
check(
  "a hazard ratio in an option is caught",
  ratioInQuestionProblems("HR 0.62").length === 1
);
check(
  "a magnitude in clinical words passes",
  ratioInQuestionProblems(
    ["Risk approximately halved", "No significant change in risk", "Approximately ten times higher"].join("\n")
  ).length === 0,
  "this is the phrasing the rule asks for"
);
check(
  "an ordinary stem with no ratio passes",
  ratioInQuestionProblems(
    "Which investigation best stratifies the risk of antenatal bleeding in persistent placenta praevia?"
  ).length === 0
);
check(
  "an abbreviation that merely starts with OR does not trip it",
  ratioInQuestionProblems("She is taken to theatre (OR) for laparotomy.").length === 0,
  "no digit follows, so it is not a point estimate"
);

/* ---- the stem that answers itself ---- */

const opts = [
  { key: "A", text: "Reverse breech extraction" },
  { key: "B", text: "Patwardhan manoeuvre" },
  { key: "C", text: "Vertical uterine extension" },
];

check(
  "a stem naming the technique it asks for is refused",
  answerInStemProblems(
    "The registrar performs a reverse breech extraction to deliver the deeply impacted head. Which manoeuvre was used?",
    opts,
    "A"
  ).length === 1
);
check(
  "a stem describing the situation without naming it is allowed",
  answerInStemProblems(
    "The fetal head is deeply impacted in the pelvis at full dilatation and cannot be elevated from below.",
    opts,
    "A"
  ).length === 0
);
check(
  "sharing one word is not giving the answer away",
  answerInStemProblems(
    "She is counselled about breech presentation at 36 weeks.",
    opts,
    "A"
  ).length === 0
);
check(
  "a one-word option cannot trigger it",
  answerInStemProblems("She is given dexamethasone.", [{ key: "A", text: "Dexamethasone" }], "A")
    .length === 0,
  "too little signal to judge, and too easy to trip on a shared noun"
);
check(
  "a missing correct option is not an excuse to throw",
  answerInStemProblems("Any stem", opts, "Z").length === 0
);

/* ---- an option that is a sentence ---- */

check(
  "an instruction to counsel is refused",
  optionSentenceProblems([
    { key: "A", text: "Inform the woman of high risk of placenta praevia in later pregnancy" },
  ]).length === 1
);
check(
  "so is a reassurance",
  optionSentenceProblems([
    { key: "H", text: "Reassure the woman that Type 1 caesarean scar pregnancy is low risk" },
  ]).length === 1
);
check(
  "a word that merely begins like one is not",
  optionSentenceProblems([{ key: "A", text: "Informed consent for hysterectomy" }]).length === 0,
  "the counselling verbs are matched as whole words"
);
check(
  "a long conditional option is refused",
  optionSentenceProblems([
    { key: "H", text: "Offer prophylactic LMWH unless birth is expected within 12 hours or there is a significant haemorrhage risk" },
  ]).length === 1,
  "seventeen words: well past an item"
);
check(
  "a full regimen at ten words is still an item",
  optionSentenceProblems([
    { key: "A", text: "IM dexamethasone 12 mg twice, then oral prednisolone 40 mg" },
  ]).length === 0,
  "the limit is set from the bank, where nine words is only the 90th percentile"
);
check(
  "ordinary clinical items pass",
  optionSentenceProblems([
    { key: "A", text: "General anaesthesia" },
    { key: "B", text: "Prophylactic LMWH" },
    { key: "C", text: "Uterine artery embolisation" },
    { key: "D", text: "Cervical length measurement by TVS" },
    { key: "E", text: "Dexamethasone 12 mg IM, two doses 24 hours apart" },
  ]).length === 0,
  "a dose is an item, and must not be mistaken for a sentence"
);
check(
  "an empty list is not a fault",
  optionSentenceProblems([]).length === 0
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
