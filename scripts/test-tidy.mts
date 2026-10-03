/**
 * The last pass over an answer before a candidate reads it.
 *
 *   npx tsx scripts/test-tidy.mts
 *
 * It exists to take out the one mark this site does not use. What it
 * must not do is touch a number range, which is written with an en
 * dash everywhere in this bank: "72–75%", "10–14 weeks", "2.0–2.3%".
 * A sweep that turned those into commas would rewrite the medicine.
 */
import { tidy } from "../src/lib/chat-service";

let failed = 0;
function check(name: string, got: string, want: string) {
  if (got === want) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}\n      got  ${got}\n      want ${want}`);
    failed += 1;
  }
}

check("a clause dash becomes a comma",
  tidy("Stop hydroxycarbamide — at least three months before."),
  "Stop hydroxycarbamide, at least three months before.");
check("tight between words",
  tidy("counselling—document it clearly"),
  "counselling, document it clearly");
check("a percentage range is left alone",
  tidy("Success is 72–75% overall."),
  "Success is 72–75% overall.");
check("a gestation range is left alone",
  tidy("Offered between 10–14 weeks."),
  "Offered between 10–14 weeks.");
check("a decimal range is left alone",
  tidy("The background rate is 2.0–2.3%."),
  "The background rate is 2.0–2.3%.");
check("a dose range is left alone",
  tidy("Give 1–2 g intravenously."),
  "Give 1–2 g intravenously.");
check("a hyphenated word is untouched",
  tidy("A source-grounded answer for low-risk women."),
  "A source-grounded answer for low-risk women.");
check("no double commas",
  tidy("First, — then second."),
  "First, then second.");
check("plain text passes through",
  tidy("Aspirin 150 mg at night from 12 weeks."),
  "Aspirin 150 mg at night from 12 weeks.");
check("citations survive",
  tidy("Folic acid 5 mg [chunk:18856] — from before conception."),
  "Folic acid 5 mg [chunk:18856], from before conception.");

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
