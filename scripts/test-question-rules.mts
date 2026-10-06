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
  ratioWithoutAbsoluteProblems,
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

/* ---- a ratio with nothing to multiply ---- */

check(
  "an odds ratio alone is refused",
  ratioWithoutAbsoluteProblems(
    "Cervical length of 30 mm or less is associated with increased odds of preterm birth (OR 8.46)."
  ).length === 1
);
check(
  "the same ratio beside an absolute risk is allowed",
  ratioWithoutAbsoluteProblems(
    "Preterm birth follows in about 25% of such pregnancies (OR 8.46 against a cervix above 30 mm)."
  ).length === 0
);
check(
  "a relative risk named in words is caught too",
  ratioWithoutAbsoluteProblems(
    "The relative risk of recurrence is roughly doubled."
  ).length === 1
);
check(
  "an absolute risk written as a proportion satisfies it",
  ratioWithoutAbsoluteProblems(
    "Recurrence is about 1 in 200, a relative risk of around 2."
  ).length === 0
);
check(
  "prose with no ratio at all is left alone",
  ratioWithoutAbsoluteProblems(
    "Offer prophylactic LMWH from 28 weeks and continue for six weeks postnatally."
  ).length === 0
);
check(
  "a hazard ratio is caught",
  ratioWithoutAbsoluteProblems("Mortality was lower (HR 0.62).").length === 1
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
  "a long conditional option is refused",
  optionSentenceProblems([
    { key: "H", text: "Offer prophylactic LMWH unless birth expected within 12 hours or significant haemorrhage risk" },
  ]).length === 1
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
