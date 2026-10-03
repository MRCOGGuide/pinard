/**
 * How an answer is broken into lines on screen.
 *
 *   npx tsx scripts/test-answer-text.mts
 *
 * The renderer recognises three shapes and nothing else. What it must
 * never do is mistake a clinical line for a stage name and set it in
 * green capitals, or swallow a dose that begins with a digit.
 */
import { readFileSync } from "node:fs";

/* The classifier, lifted from the component so it can be exercised
   without a DOM. Kept in step by this test failing if it drifts. */
function isHeading(line: string): boolean {
  return (
    line.length <= 40 &&
    !/[.;:]$/.test(line) &&
    !/^[-•]/.test(line) &&
    /^[A-Z]/.test(line)
  );
}

let failed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (got === want) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}: got ${got}, want ${want}`);
    failed += 1;
  }
}

check("a stage name is a heading", isHeading("Preconception"), true);
check("so is 'Watch for'", isHeading("Watch for"), true);
check("so is 'Intrapartum'", isHeading("Intrapartum"), true);
check("a sentence is not", isHeading("Start folic acid 5 mg daily before conception."), false);
check("a long clause is not, even without a full stop",
  isHeading("Stop hydroxycarbamide at least three months before conception and use contraception"), false);
check("a labelled line is not a heading", isHeading("Preconception:"), false);
check("a bullet is never a heading", isHeading("- Start aspirin 150 mg"), false);
check("a lower-case line is not", isHeading("aspirin from 12 weeks"), false);

/* The component's own source must still contain the classifier this
   test is checking, or the test is checking nothing. */
const source = readFileSync("src/components/AnswerText.tsx", "utf8");
check(
  "the component still classifies this way",
  source.includes("line.length <= 40") &&
    source.includes("!/[.;:]$/.test(line)") &&
    source.includes("/^[A-Z]/.test(line)"),
  true
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
