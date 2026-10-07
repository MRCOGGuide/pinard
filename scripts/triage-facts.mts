/**
 * The fact audit's verified findings, one readable file, for deciding.
 *
 *   npx tsx scripts/triage-facts.mts --in .review/revise/facts --support .review/revise/support --out .review/revise/triage.md
 *
 * Each unit with findings is printed with the finding's index (the
 * number build-fact-repairs' decisions refer to), the question's words,
 * the passage's words, the reviewer's correction and what find-support
 * found. Findings whose quote could not be matched were already dropped
 * by audit-facts and are not shown.
 *
 * Reading this file is the step that matters. The reviewer is right
 * often enough to be worth reading and wrong often enough that nothing
 * it says is applied unread: it has called a correct "progestogen" a
 * misquote, and claimed a drug was withdrawn when only one of its
 * indications was.
 */
import fs from "node:fs";
import path from "node:path";

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const IN = arg("--in", ".review/facts");
const SUPPORT = arg("--support", ".review/support");
const OUT = arg("--out", ".review/triage.md");

type Finding = {
  kind: string;
  where: string;
  quote: string;
  passage_quote?: string;
  chunk_id?: number;
  problem: string;
  correction?: string;
  verified: boolean;
};
type Saved = { key: string; ids: number[]; passages: number[]; findings: Finding[] };

const units = fs
  .readdirSync(IN)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(IN, f), "utf8")) as Saved)
  .sort((a, b) => a.ids[0] - b.ids[0]);

const out: string[] = [];
let n = 0;
for (const u of units) {
  const kept = u.findings.map((x, i) => ({ ...x, i })).filter((x) => x.verified);
  if (!kept.length) continue;
  n += 1;
  out.push(`\n### ${u.key}  ${u.ids.join(",")}  (cites ${u.passages.join(",")})`);
  for (const x of kept) {
    out.push(
      `[${x.i}] ${x.kind} | ${x.where}: "${x.quote}"\n    ${x.problem}` +
        (x.passage_quote ? `\n    src[${x.chunk_id}]: "${x.passage_quote}"` : "") +
        (x.correction ? `\n    fix: ${x.correction}` : "")
    );
    const sp = path.join(SUPPORT, `${u.key}-${x.i}.json`);
    if (fs.existsSync(sp)) {
      const s = JSON.parse(fs.readFileSync(sp, "utf8"));
      out.push(
        `    SUPPORT: ${
          s.supported
            ? "YES " +
              s.support
                .map((y: { chunk_id: number; document: string; quote: string }) => `[${y.chunk_id}] ${y.document.slice(0, 60)}: "${y.quote.slice(0, 140)}"`)
                .join(" + ")
            : "no"
        }${s.differs ? `\n    DIFFERS: ${String(s.differs).slice(0, 400)}` : ""}`
      );
    }
  }
}
fs.writeFileSync(OUT, out.join("\n"));
console.log(`${n} of ${units.length} unit(s) with findings written to ${OUT}`);
