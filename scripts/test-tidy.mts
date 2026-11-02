/**
 * The last pass over an answer before a candidate reads it.
 *
 *   npx tsx --conditions=react-server scripts/test-tidy.mts
 *
 * It exists to take out the one mark this site does not use. What it
 * must not do is touch a number range, which is written with an en
 * dash everywhere in this bank: "72–75%", "10–14 weeks", "2.0–2.3%".
 * A sweep that turned those into commas would rewrite the medicine.
 */
import { tidy, withoutUnsupportedLines } from "../src/lib/chat-service";

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

check("a sentence before the first stage is dropped",
  tidy("She is already in the antenatal period, so the pathway runs from here forward.\n\nAntenatal\n- Joint clinic [chunk:1]"),
  "Antenatal\n- Joint clinic [chunk:1]");
check("an answer that starts with its stage is unchanged",
  tidy("Postpartum\n- Review AED doses within 10 days"),
  "Postpartum\n- Review AED doses within 10 days");
check("a single-fact answer is left whole",
  tidy("The risk is about 1 in 200.\n- Higher with induction"),
  "The risk is about 1 in 200.\n- Higher with induction");
check("a stage word inside a sentence is not a stage line",
  tidy("Management depends on gestation.\n- Deliver at 37 weeks"),
  "Management depends on gestation.\n- Deliver at 37 weeks");

/* The last resort when a rewrite will not fit: the lines a check named
   go, nothing is rewritten, and a stage left empty goes with them. */
const scenario = [
  "Risks to the mother",
  "- ITP: severe PPH [chunk:1]",
  "",
  "Antenatal",
  "- Platelets 1.5 times a week [chunk:2]",
  "",
  "Intrapartum",
  "- Avoid ventouse [chunk:3]",
  "- Cell salvage if acceptable [chunk:99]",
].join("\n");
const salvage = (figures: string[], chunks: number[] = []) =>
  withoutUnsupportedLines({ reply: scenario, flagged: false, figures, chunks, aids: [] }, undefined);
check("a line with an unsupported figure goes, and its empty stage",
  salvage(["1.5"]),
  "Risks to the mother\n- ITP: severe PPH [chunk:1]\n\nIntrapartum\n- Avoid ventouse [chunk:3]\n- Cell salvage if acceptable [chunk:99]");
check("a line citing a passage not given goes",
  salvage([], [99]),
  "Risks to the mother\n- ITP: severe PPH [chunk:1]\n\nAntenatal\n- Platelets 1.5 times a week [chunk:2]\n\nIntrapartum\n- Avoid ventouse [chunk:3]");
check("a figure is not found inside a longer number",
  salvage(["11.5"]),
  "");
check("more than three lines at fault and nothing is shown",
  withoutUnsupportedLines({ reply: "- a 10 [chunk:1]\n- b 10 [chunk:1]\n- c 10 [chunk:1]\n- d 10 [chunk:1]", flagged: false, figures: ["10"], chunks: [], aids: [] }, undefined),
  "");

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
