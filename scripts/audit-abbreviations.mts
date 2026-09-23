/**
 * Every abbreviation the bank uses, and whether it is ever expanded.
 *
 *   npx tsx scripts/audit-abbreviations.mts            # all of them
 *   npx tsx scripts/audit-abbreviations.mts --bare     # only the unexpanded
 *
 * A question may not lean on an abbreviation an ST5 would not know —
 * TESE, MESA, PESA in #1297, FET and TVOR in #1411, FVC in #1417. The
 * judgement of which ones qualify is the reviewer's, not a script's, so
 * this counts and locates them and says nothing about which are fair.
 *
 * "Expanded" means the question writes it out somewhere — "frozen embryo
 * transfer (FET)". The rule is once per question, in the options, so a
 * term expanded in one question and bare in another is still listed as
 * bare there.
 */

import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");

const db = createAdminClient();

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  explanation: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, explanation, options, explanations")
    .neq("status", "rejected")
    .order("id")
    .range(from, to)
);

/*
  Two or more capitals, optionally with digits or a hyphen — CTG, LSCS,
  HELLP, 5-HT, TNF-a. Units and Roman numerals are not abbreviations of
  the kind being audited, and nor is a word that happens to be shouted.
*/
const TOKEN = /\b[A-Z][A-Za-z]*[A-Z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)?\b/g;
const IGNORE = new Set([
  // Units and measures.
  "IU", "IUs", "ML", "MG", "KG", "MM", "CM", "BPM", "MMHG",
  // Roman numerals used for stages and grades.
  "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII",
  // Sentence-initial shouting and formatting artefacts.
  "SINGLE", "NOT", "BEST", "MOST", "EACH", "ALL", "NONE", "TRUE", "FALSE",
  "A", "I",
]);

type Use = { bare: Set<number>; expanded: Set<number> };
const uses = new Map<string, Use>();

for (const row of rows) {
  const optionText = (row.options ?? []).map((o) => o.text).join(" ‖ ");
  const other = [
    row.stem,
    row.lead_in ?? "",
    row.explanation ?? "",
    ...(row.explanations ?? []).map((e) => e.text),
  ].join(" ‖ ");
  const all = `${optionText} ‖ ${other}`;

  const found = new Set<string>();
  for (const m of all.matchAll(TOKEN)) {
    if (!IGNORE.has(m[0])) found.add(m[0]);
  }

  for (const term of found) {
    // Expanded if it appears in brackets after words — "... (FET)".
    const expanded = new RegExp(`[a-z][^\\u2016]{0,80}\\(${escape(term)}\\)`).test(all);
    let use = uses.get(term);
    if (!use) uses.set(term, (use = { bare: new Set(), expanded: new Set() }));
    (expanded ? use.expanded : use.bare).add(row.id);
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

const bareOnly = process.argv.includes("--bare");
const listed = [...uses.entries()]
  .filter(([, u]) => (bareOnly ? u.bare.size > 0 : true))
  .sort((a, b) => b[1].bare.size + b[1].expanded.size - (a[1].bare.size + a[1].expanded.size));

console.log(
  `${listed.length} abbreviations across ${rows.length} approved or pending questions\n`
);
console.log("used   bare  expanded  term       first few questions using it bare");
console.log("-".repeat(78));
for (const [term, u] of listed) {
  const total = u.bare.size + u.expanded.size;
  const examples = [...u.bare].slice(0, 6).map((n) => `#${n}`).join(" ");
  console.log(
    `${String(total).padStart(4)}  ${String(u.bare.size).padStart(5)}  ${String(
      u.expanded.size
    ).padStart(8)}  ${term.padEnd(10)} ${examples}`
  );
}

/*
  --json writes the same inventory as data, for the review page that
  the reviewer actually works through.
*/
if (process.argv.includes("--json")) {
  const out = listed.map(([term, u]) => ({
    term,
    bare: [...u.bare].sort((a, b) => a - b),
    expanded: [...u.expanded].sort((a, b) => a - b),
  }));
  fs.writeFileSync(process.argv[process.argv.indexOf("--json") + 1], JSON.stringify(out));
  console.log(`wrote ${out.length} terms`);
}
