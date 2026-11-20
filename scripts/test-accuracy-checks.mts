/**
 * The checks added after the audits of 19 and 20 November 2026 (owner:
 * "Questions accuracy is the single most important feature"; "any issues
 * make sure it never recurs"). Cases from the questions those audits
 * repaired. Offline.
 *
 *   npx tsx --conditions=react-server scripts/test-accuracy-checks.mts
 */
const { strengthProblems } = await import("../src/lib/wordingStrength");
const { parityProblems, studySubjectProblems } = await import("../src/lib/generation");

let passed = 0;
let failed = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got === want) passed++;
  else failed++;
  console.log(`${got === want ? "PASS" : "FAIL"}  ${want ? "refused" : "allowed"}: ${name}`);
};
const ex = (text: string) => [{ label: "explanation", text }];

// No firmer than the guidance.
const should = ["Auscultation and cardiotocography should not be used to diagnose late IUFD."];
check("#333 \"must not\" where the guideline says \"should not\"", strengthProblems(ex("Auscultation and CTG must not be used to diagnose late IUFD."), should).length > 0, true);
check("the guideline's own \"should not\"", strengthProblems(ex("Auscultation and CTG should not be used to diagnose late IUFD."), should).length > 0, false);
check("#662 \"contraindicated\" where it says \"should be avoided\"", strengthProblems(ex("Co-amoxiclav is specifically contraindicated."), ["Co-amoxiclav should be avoided as it is associated with NEC."]).length > 0, true);
check("#2376 \"is indicated\" where it says \"consider\"", strengthProblems(ex("Transfusion is indicated when haemoglobin falls below 70 g/l."), ["Consider transfusion if haemoglobin less than 70 g/l."]).length > 0, true);
check("#204 \"explicitly prohibited\" where it says \"should not be used\"", strengthProblems(ex("These are explicitly prohibited uses of AI translation."), ["AI translation should not be used for consent."]).length > 0, true);
check("a \"must\" the guideline itself uses", strengthProblems(ex("The death must be reported to the coroner."), ["A death must be reported to the coroner if..."]).length > 0, false);
check("\"an absolute figure of 3 kg\" is a quantity", strengthProblems(ex("The threshold is 5% of baseline, not an absolute figure of 3 kg."), ["weight gain of 5%"]).length > 0, false);
check("\"absolute contraindication\" the guideline does not give", strengthProblems(ex("Previous rupture is an absolute contraindication to VBAC."), ["previous uterine rupture is considered a contraindication to VBAC"]).length > 0, true);
check("\"essential hypertension\" is a diagnosis", strengthProblems(ex("She has essential hypertension."), ["chronic hypertension"]).length > 0, false);
check("a stem's \"never smoked\" is her history", strengthProblems([{ label: "stem", text: "She has never smoked.", stem: true }], ["smoking"]).length > 0, false);
check("#197 \"mandatory\" the guideline splits across a line (\"manda- tory\")", strengthProblems(ex("No mandatory reporting exists for mild cases."), ["there is no manda- tory reporting for mild and moderate cases"]).length > 0, false);
check("a split word is not invented from two words (\"pre- and post-\")", strengthProblems(ex("Monitoring is mandatory."), ["pre- and post-operative care"]).length > 0, true);
check("#2786 a stem's \"must be documented\"", strengthProblems([{ label: "stem", text: "Which piece of information must be documented at birth?", stem: true }], ["It is particularly important to document at birth"]).length > 0, true);

// One study's result.
check("#2766 after a simulation training session", studySubjectProblems("What proportion could do so three weeks after a 40-minute simulation training session?").length > 0, true);
check("#2767 after the introduction of annual training", studySubjectProblems("What was the rate of neonatal injury at birth following shoulder dystocia after the introduction of annual training?").length > 0, true);
check("annual training as the guidance's advice", studySubjectProblems("How often should all maternity staff attend shoulder dystocia training?").length > 0, false);

// Parity once she has given birth.
check("#2620 gravida 2 para 1 with a postmortem result", parityProblems("A 32-year-old woman, gravida 2 para 1, is reviewed following late IUFD at 30 weeks. The postmortem reveals a fetal unbalanced translocation.").length > 0, true);
check("para 2 with a postmortem result", parityProblems("A 32-year-old woman, para 2, is reviewed following late IUFD at 30 weeks. The postmortem reveals a fetal unbalanced translocation.").length > 0, false);
check("an IUFD diagnosed, not yet born", parityProblems("A 32-year-old woman, gravida 2 para 1, at 30 weeks is found to have a late IUFD on ultrasound.").length > 0, false);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
