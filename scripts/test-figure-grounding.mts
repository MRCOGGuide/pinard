/**
 * Does every figure in an explanation come from somewhere it cites?
 *
 *   npx tsx scripts/test-figure-grounding.mts
 *
 * Built from the two cases that prompted it, both found by reading a
 * repair rather than by any check: Q2028's "reversed within four hours"
 * and Q2053's "a minimum of three weeks", each true and each taken from
 * a passage the question did not cite. The refusals matter as much as
 * the acceptances: a check that flags vignette figures, grade labels or
 * a number written in words where the passage uses digits would be
 * ignored within a day.
 */
import { figureGroundingProblems, normaliseFigures } from "../src/lib/generation";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

const GTG37A =
  "The benefits of UFH are that it has a shorter half-life than LMWH and there is more complete reversal of its activity by protamine sulfate. If UFH is used after caesarean section the platelet count should be monitored every 2–3 days from days 4–14 or until heparin is stopped.";
const TOG =
  "It can be useful when imminent delivery is planned, however, because the anticoagulant effect is reversed within 4 hours of stopping the infusion.";

const q2028 =
  "When UFH is used after CS the platelet count should be monitored every 2-3 days from days 4-14 or until UFH is stopped. It has a shorter half-life, and its effect is reversed within four hours of stopping the infusion.";

/* ---- the two real faults ---- */

const before = figureGroundingProblems(q2028, [GTG37A]);
check(
  "Q2028 as applied: four hours, cited from nowhere, is flagged",
  before.length === 1 && before[0].includes("4 hour"),
  JSON.stringify(before)
);
check(
  "and once the TOG passage is cited it passes",
  figureGroundingProblems(q2028, [GTG37A, TOG]).length === 0,
  JSON.stringify(figureGroundingProblems(q2028, [GTG37A, TOG]))
);

const FGR_20060 =
  "There is likely to be a difference between EFW calculated using HC, AC and FL results and EFW calculated using AC and FL results only, depending on fetal proportions.";
const FGR_20059 =
  "If two measurements are to be used to estimate velocity, they should be a minimum of 3 weeks apart to minimise false positive rates for diagnosing FGR.";
const q2053 =
  "Switching formula can produce an artefactual centile shift. Growth velocity needs measurements a minimum of three weeks apart.";

check(
  "Q2053 as first proposed: three weeks, uncited, is flagged",
  figureGroundingProblems(q2053, [FGR_20060]).some((p) => p.includes("3 week"))
);
check(
  "and passes with 20059 cited",
  figureGroundingProblems(q2053, [FGR_20060, FGR_20059]).length === 0
);

/* ---- what it must leave alone ---- */

check(
  "a vignette's own number is supported by the stem",
  figureGroundingProblems("At booking her BMI of 33 scores 1.", [
    "Obesity (BMI ≥ 30 kg/m2) scores 1.",
    "A 29-year-old with a BMI of 33 kg/m² attends at 10 weeks.",
  ]).length === 0
);
check(
  "an interval the vignette gives is supported by the stem",
  figureGroundingProblems("A 4-week interval is sufficient.", [
    "measurements should be a minimum of 3 weeks apart",
    "At 32 weeks... the previous scan at 28 weeks",
  ]).every((p) => !p.includes("4-week")),
  "flagging the vignette's own arithmetic would make the check unusable"
);
check(
  "grade and option labels are not figures",
  figureGroundingProblems(
    "Outcomes are poorer after grade 3c and fourth-degree tears than grade 3a; option 4 is wrong; evidence level 2.",
    ["Grade 3a tear: less than 50% of EAS thickness torn."]
  ).length === 0
);
check(
  "a number in words matches the same number in digits",
  figureGroundingProblems("Offer a scan within fourteen days of recovery.", [
    "arrange the first scan within the first 14 days following recovery",
  ]).length === 0
);
check(
  "units match across their spellings",
  figureGroundingProblems("Stop LMWH 24 hrs before delivery.", [
    "LMWH therapy should be discontinued 24 hours prior to planned delivery.",
  ]).length === 0
);
check(
  "an en dash and a hyphen are the same range",
  figureGroundingProblems("60-80% are asymptomatic at 12 months.", [
    "60–80% of women are asymptomatic 12 months following delivery",
  ]).length === 0
);
check(
  "'1 in 10' is matched as written in words",
  figureGroundingProblems("Fewer than one in 10 registrars know it.", [
    "fewer than 1 in 10 UK registrars were familiar with the technique",
  ]).length === 0
);
check(
  "a single bare digit is not judged",
  figureGroundingProblems("Two current risk factors mean 10 days postpartum.", [
    "two current risk factors should be considered for LMWH for at least 10 days postpartum",
  ]).length === 0
);

/* ---- what it must still catch ---- */

check(
  "a dose the passage does not state is flagged",
  figureGroundingProblems("Give dexamethasone 6 mg twice.", [
    "dexamethasone 12 mg IM, two doses 24 hours apart",
  ]).some((p) => p.includes("6 mg"))
);
check(
  "a computed percentage the passage never states is flagged",
  figureGroundingProblems("This reduces the risk by approximately 45%.", [
    "RR 0.55, 95% CI 0.37-0.82",
  ]).some((p) => p.includes("45%")),
  "the arithmetic the grounding checker refuses"
);
check(
  "the right number with the wrong unit is flagged",
  figureGroundingProblems("Arrange the scan within 14 weeks.", [
    "within the first 14 days following recovery",
  ]).some((p) => p.includes("14 week"))
);
check(
  "a range that differs from the passage's is flagged",
  figureGroundingProblems("Monitor every 3-5 days.", [
    "monitored every 2–3 days from days 4–14",
  ]).some((p) => p.includes("3-5 day"))
);

/* ---- phrasings the first bank-wide run misread ---- */

check(
  "a confidence interval written with 'to' matches one written with a dash",
  figureGroundingProblems("(RR 0.83, 95% CI 0.59-2.10)", ["RR 0.83 (95% CI 0.59 to 2.10)"]).length === 0
);
check(
  "a percentage range written with 'to' matches",
  figureGroundingProblems("Sensitivity is 92-99%.", ["sensitivity of 92% to 99%"]).length === 0
);
check(
  "a fall 'from X to Y' is two figures, not a range",
  figureGroundingProblems("Infection fell from 19% to 11%.", ["(306 [19%] of 1606) ... (180 [11%] of 1619)"]).length === 0
);
check(
  "a blood pressure pair states both pressures",
  figureGroundingProblems("Treat at 150 mmHg systolic or 95 mmHg diastolic.", ["target below 150/95 mmHg"]).length === 0
);
check(
  "a count and a year are not a ratio, and the year is not a figure",
  figureGroundingProblems("There were 394,781 births in 2022.", ["394 781 births were recorded"]).length === 0
);
check(
  "a real '1 in N' that no source gives is still caught",
  figureGroundingProblems("The risk is about 1 in 41.", ["The risk is 2.4%."]).some((p) => p.includes("1 in 41")),
  "converting a percentage into a 1-in-N is arithmetic the source never did"
);

check(
  "a range written 'between X and Y' matches",
  figureGroundingProblems("(RR 1.09-1.38)", ["(rr between 1.09 and 1.38)"]).length === 0
);
check(
  "a change 'from X to Y per 1000' is two figures the source states",
  figureGroundingProblems("from 150 to 240 per 1000", ["(150/1000 to 240/1000, rr 1.60)"]).length === 0
);
check(
  "a table that leaves off the unit still supports it",
  figureGroundingProblems("diastolic 95 mmHg or more", ["home systolic ≥ 150 and/or diastolic ≥ 95"]).length === 0
);
check(
  "but a different unit in the source is still refused",
  figureGroundingProblems("within 14 weeks", ["within 14 days"]).some((p) => p.includes("14 week"))
);
check(
  "an odds ratio followed by 'in 1 large series' is not a ratio of 8.1 in 1",
  figureGroundingProblems("(OR 8.1 in 1 large series)", ["reported an odds ratio of 8.1"]).length === 0
);
check(
  "trailing zeros do not make a different figure",
  figureGroundingProblems("PPV of 75%", ["ppv 75.0%"]).length === 0
);

check(
  "'over 124 000' for a study of 124 215 is rounding, not invention",
  figureGroundingProblems("a meta-analysis of over 124 000 ART pregnancies", ["evaluating 124 215 ART and 6 054 729 non-ART"]).length === 0
);
check(
  "but an unqualified round number the source does not give is still caught",
  figureGroundingProblems("a cohort of 124 000 women", ["evaluating 124 215 ART"]).some((p) => p.includes("124000"))
);
check(
  "a negative mean difference states its magnitude",
  figureGroundingProblems("MD 0.02 g/cm2 at 6 months", ["at 6 months of follow-up (MD -0.02; 95%CI -0.03 to -0.01)"]).length === 0
);
check(
  "converting 2.4% into '1 in 41' is still caught",
  figureGroundingProblems("a rate of 2.4% (1 in 41 women)", ["a further dehiscence rate of 2.4%"]).some((p) => p.includes("1 in 41"))
);

check(
  "the 95 of a 95% CI is a confidence level, not a figure to find",
  figureGroundingProblems("a 17.4% (95% CI 11.8-31.2%) lifetime risk", ["17.4% (11.8% to 31.2%)"]).length === 0
);
check(
  "a span of years is a date",
  figureGroundingProblems("8.76 for 2013-15", ["8.76 per 100 000 maternities"]).length === 0
);
check(
  "but a percentage computed from a hazard ratio is still caught",
  figureGroundingProblems("HR 1.84, an 84% higher risk", ["HR 1.84 (95% CI 1.27-2.69)"]).some((p) => p.includes("84%"))
);

check(
  "a unit set solid against its number is the same figure",
  figureGroundingProblems("an immediate 500 ml bolus", ["an immediate 500ml fluid bolus"]).length === 0
);

/* ---- the library's own damage ---- */

check(
  "a passage whose decimal points were lost on ingestion still supports the figure",
  figureGroundingProblems(
    "Infection fell from 19% to 11% (RR 0.58, 95% CI 0.49-0.69).",
    ["(180 [11%] of 1619) ... (306 [19%] of 1606; RR 058, 95% CI 049–069; P < 00001)"]
  ).length === 0,
  "GTG 26 as ingested; Q2066 is right and the passage is damaged"
);
check(
  "a mid-dot decimal is a decimal",
  figureGroundingProblems("RR 0.58", ["relative risk 0·58"]).length === 0
);
check(
  "the leniency does not let a different decimal through",
  figureGroundingProblems("RR 0.68", ["RR 058, 95% CI 049–069"]).some((p) => p.includes("0.68"))
);

check(
  "normalising leaves ordinals alone",
  normaliseFigures("the third trimester") === "the third trimester"
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
