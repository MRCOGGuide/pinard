// Words the product must not use (pre-launch review, 18 November 2026). Fails if candidate-facing
// code says them. 70% is Pinard's target, not "the pass mark": the RCOG sets its own for each sitting.
// Usage: npx tsx scripts/test-banned-wording.mts
import fs from "node:fs";
import path from "node:path";

const BANNED: [RegExp, string][] = [
  [/the mark the exam asks for/i, "70% is Pinard's target, not the exam's mark"],
  [/the mark you need/i, "70% is Pinard's target, not the exam's mark"],
  [/on course to pass/i, "no plan can say a candidate is on course to pass"],
  [/["'>]\s*PASS\s*["'<]/, "no PASS badge: say Target met"],
  [/\d+%,? the pass mark/i, "70% is Pinard's target, not the pass mark"],
  [/the \$\{PASS_THRESHOLD\}% pass mark|\{PASS_THRESHOLD\}% pass mark/, "70% is Pinard's target, not the pass mark"],
  [/>\s*Pass mark/, "label it Pinard's target"],
  [/cites the exact passage|the exact passage it/i, "candidates see the guideline and edition, not the passage"],
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Candidate-facing code; the admin area and this test's own reasons are left out.
const files = walk("src").filter((f) => !f.includes(`${path.sep}admin${path.sep}`));
let failed = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    // A line that names the words in order to catch them says so.
    if (line.includes("banned-wording: allow")) return;
    // Comments explain the rule; only what is shown or sent to the model counts.
    const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, "");
    for (const [pattern, why] of BANNED) {
      if (pattern.test(code)) {
        failed++;
        console.log(`FAIL  ${file}:${i + 1}  ${why}\n      ${line.trim().slice(0, 140)}`);
      }
    }
  });
}
console.log(failed ? `${failed} failed` : `banned wording: all passed (${files.length} files)`);
if (failed) process.exit(1);
