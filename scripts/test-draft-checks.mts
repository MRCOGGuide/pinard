// The automatic checks added after the 15 November Revise run: parity that does not fit the moment, a figure inside
// another option's range, and a guidance body named in the stem. Cases from the questions the run repaired.
// Usage: npx tsx --conditions=react-server scripts/test-draft-checks.mts
const { parityProblems, rangeOverlapProblems, guidanceNamedProblems } = await import("../src/lib/generation");

let failed = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got !== want) failed++;
  console.log(`${got === want ? "pass" : "FAIL"}  ${want ? "refused" : "allowed"}: ${name}`);
};
const opts = (...texts: string[]) => texts.map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

// Parity: refused.
check("#2609 gravida 1 para 0 delivers", parityProblems("A 28-year-old woman, gravida 1 para 0, delivers vaginally at 40 weeks following a forceps birth. On systematic perineal assessment, the EAS is torn.").length > 0, true);
check("#2626 gravida 2 para 2 on the postnatal ward", parityProblems("A 33-year-old woman, gravida 2 para 2, is reviewed on the postnatal ward three days after an emergency CS.").length > 0, true);
check("#2754 gravida 1 para 0, 5 days postpartum", parityProblems("A 28-year-old woman, gravida 1 para 0, is 5 days postpartum following an uncomplicated vaginal delivery.").length > 0, true);
check("#2624 gravida 1 para 0 delivers by CS", parityProblems("A 28-year-old woman, gravida 1 para 0, delivers by emergency CS at 38 weeks under general anaesthesia.").length > 0, true);
check("nulliparous after a stillbirth", parityProblems("A 30-year-old nulliparous woman books at 10 weeks. She had a stillbirth at 32 weeks two years ago.").length > 0, true);
// Parity: allowed.
check("pregnant, with an earlier birth mentioned", parityProblems("A 30-year-old woman, gravida 2 para 1, attends at 36 weeks. She delivered her first baby by CS for breech.").length > 0, false);
check("in labour", parityProblems("A 32-year-old woman, gravida 2 para 1, is in established VBAC labour at 39 weeks. She has a single previous LSCS.").length > 0, false);
check("#2604 primigravida, no risk factors for stillbirth", parityProblems("A 26-year-old primigravida at 28+3 weeks attends with a 12-hour history of RFM. There are no additional risk factors for stillbirth.").length > 0, false);
check("para after birth", parityProblems("A 28-year-old woman, para 1, has just had a forceps birth at 40 weeks.").length > 0, false);
check("previous SGA baby, now pregnant", parityProblems("A 34-year-old woman, gravida 2 para 1, attends at 32 weeks reporting RFM. Her previous pregnancy was complicated by delivery of an SGA baby.").length > 0, false);

// A figure inside another option's range.
check("#2679 7% inside 6-12%", rangeOverlapProblems(opts("Approximately 3%", "Between approximately 6% and 12%", "Approximately 7%", "Approximately 16%", "Approximately 22%")).length > 0, true);
check("74% inside 72–75%", rangeOverlapProblems(opts("Approximately 72–75%", "Approximately 74%", "Approximately 50%", "Approximately 85–90%", "Approximately 40%")).length > 0, true);
check("#2679 as repaired", rangeOverlapProblems(opts("Approximately 1%", "Approximately 3%", "Between approximately 6% and 12%", "Approximately 16%", "Approximately 22%")).length > 0, false);
check("ranges side by side", rangeOverlapProblems(opts("6–9%", "17–32%", "40–55%", "60–75%", "75–95%")).length > 0, false);
check("ratios", rangeOverlapProblems(opts("1 in 20", "1 in 50", "1 in 500", "1 in 2500", "1 in 10 000")).length > 0, false);
check("a boundary is not inside", rangeOverlapProblems(opts("20–30%", "20%", "40%", "50%", "60%")).length > 0, false);
check("different units", rangeOverlapProblems(opts("2–4 weeks", "3 days", "6 weeks", "8 weeks", "10 weeks")).length > 0, false);

// A guidance body named in the stem.
check("#2697 BCSH-defined", guidanceNamedProblems("Anaemia in pregnancy is defined using thresholds recommended by the British Committee for Standards in Haematology (BCSH). What is the BCSH-defined Hb threshold for anaemia in the second trimester?").length > 0, true);
check("BCSH-defined alone", guidanceNamedProblems("What is the BCSH-defined Hb threshold for anaemia in the second trimester?").length > 0, true);
check("no body named", guidanceNamedProblems("What Hb threshold defines anaemia in the second trimester of pregnancy?").length > 0, false);

// The audit's explanation-only findings are mended after the last attempt; a second answer is not.
const { isMendable } = await import("../src/lib/generation");
check("audit: unsupported sentence in the explanation is mendable", !isMendable(["independent audit, unsupported (explanation): The cited passage does not mention hydralazine."]), false);
check("audit: overstated explanation is mendable", !isMendable(["independent audit, misquoted (explanation): 'must' where the passage says 'should'."]), false);
check("audit: a second answer is not mendable", isMendable(["independent audit, second answer (option B): also recommended."]), false);
check("audit: an incoherent stem is not mendable", isMendable(["independent audit, incoherent (stem): para 0 after birth."]), false);

console.log(failed ? `${failed} failed` : "draft checks: all passed");
if (failed) process.exit(1);
