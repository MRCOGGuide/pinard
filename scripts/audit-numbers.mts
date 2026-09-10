/**
 * Numeric and internal-consistency audit.
 *
 * Question 1153 was keyed to the wrong answer because the stem said a
 * 58-year-old while the explanation and its highlighted table row
 * applied the 61-74 age band. Scored correctly she totalled 4, not the
 * 5 the question marked right — a candidate who got it right was told
 * they were wrong. Nothing in the verification layer looks at whether
 * a number in the stem is consistent with how the explanation treats
 * it, so this does.
 *
 * Every check is deterministic and prints its evidence, because a flag
 * a human cannot check is worse than no flag at all.
 *
 *   npx tsx scripts/audit-numbers.mts               # whole bank
 *   npx tsx scripts/audit-numbers.mts 1153 1154     # named ids
 *   npx tsx scripts/audit-numbers.mts --soft        # include low-precision checks
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
const { appliedBandProblems } = await import("../src/lib/generation");
const { parseExplanationTable } = await import("../src/lib/explanationTable");
const db = createAdminClient();

type Table = {
  rows?: string[][];
  columns?: string[];
  highlight?: number[] | number;
  caption?: string;
};
type Option = { key: string; text: string };
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  options: Option[] | null;
  correct_key: string | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
  explanation_table: Table | null;
  coverage_note: string | null;
};

const args = process.argv.slice(2);
const soft = args.includes("--soft");
const wanted = args.map(Number).filter((n) => !Number.isNaN(n) && n > 0);

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  let sel = db
    .from("generated_questions")
    .select(
      "id, status, format, stem, options, correct_key, explanations, explanation, explanation_table, coverage_note"
    )
    .order("id")
    .range(from, from + 999);
  if (wanted.length) sel = sel.in("id", wanted);
  const { data, error } = await sel;
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

/** Everything the explanation says in prose. */
function proseOf(q: Row): string {
  const parts: string[] = [];
  for (const e of q.explanations ?? []) if (e.text) parts.push(e.text);
  if (q.explanation) parts.push(q.explanation);
  return parts.join("\n");
}

function tableText(t: Table | null): string {
  if (!t?.rows) return "";
  return t.rows.map((r) => r.join(" | ")).join("\n");
}

/**
 * The table rows the question asserts apply to this patient. A
 * highlight is the strongest signal in the data: it is the question
 * pointing at a row and saying "this one is hers".
 */
function highlightedRows(t: Table | null): string[] {
  if (!t?.rows) return [];
  const raw = t.highlight;
  const hi = Array.isArray(raw) ? raw : typeof raw === "number" ? [raw] : [];
  return hi
    .map((i) => t.rows?.[i])
    .filter((r): r is string[] => Array.isArray(r))
    .map((r) => r.join(" | "));
}

const DASH = "[\\u2010-\\u2015\\u2212-]";
const NUM = "\\d{1,4}(?:\\.\\d{1,2})?";

/**
 * Quantities the audit understands. `unit` is the regex fragment that
 * follows the number; `label` names it in a finding. Only quantities
 * whose stem value means "this patient's value" are listed — a unit
 * that usually appears as a dose or a rate would produce noise.
 */
const QUANTITIES: { label: string; unit: string; stemOnly?: RegExp }[] = [
  { label: "age", unit: "(?:years?|yrs?)\\s*(?:of age)?" },
  { label: "gestation", unit: "(?:weeks?)(?:['\\u2019]?\\s*gestation)?" },
  { label: "duration of surgery", unit: "(?:minutes?|mins?)" },
  { label: "BMI", unit: "" },
];

function bandsIn(text: string, unit: string): { lo: number; hi: number; raw: string }[] {
  const tail = unit ? "\\s*" + unit : "";
  const re = new RegExp(
    "(" + NUM + ")\\s*(?:" + DASH + "|\\s+to\\s+)\\s*(" + NUM + ")" + tail,
    "gi"
  );
  const out: { lo: number; hi: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ lo: Number(m[1]), hi: Number(m[2]), raw: m[0].trim() });
  return out;
}

const OPS = "≥|>=|>|≤|<=|<|at least|no less than|over|under|below|above|more than|less than|older than|younger than|beyond";

function thresholdsIn(text: string, unit: string): { op: string; n: number; raw: string }[] {
  const tail = unit ? "\\s*" + unit : "";
  const re = new RegExp("(" + OPS + ")\\s*(" + NUM + ")" + tail, "gi");
  const out: { op: string; n: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ op: m[1].toLowerCase(), n: Number(m[2]), raw: m[0].trim() });
  return out;
}

function holds(op: string, n: number, value: number): boolean {
  switch (op) {
    case "≥":
    case ">=":
    case "at least":
    case "no less than":
      return value >= n;
    case ">":
    case "over":
    case "above":
    case "more than":
    case "older than":
    case "beyond":
      return value > n;
    case "≤":
    case "<=":
      return value <= n;
    case "<":
    case "under":
    case "below":
    case "less than":
    case "younger than":
      return value < n;
    default:
      return true;
  }
}

/** Every value the stem gives for a quantity. */
function stemValues(stem: string, q: { label: string; unit: string }): number[] {
  if (q.label === "BMI") {
    const out: number[] = [];
    const re = new RegExp("BMI\\s*(?:of|is|was|=|at)?\\s*(" + NUM + ")", "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(stem))) out.push(Number(m[1]));
    return out;
  }
  if (q.label === "age") {
    const out: number[] = [];
    const re = new RegExp("(\\d{1,3})\\s*(?:-|\\s)\\s*year\\s*(?:-|\\s)\\s*old", "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(stem))) out.push(Number(m[1]));
    const aged = stem.match(/\baged\s+(\d{1,3})\b/i);
    if (aged) out.push(Number(aged[1]));
    return out;
  }
  const out: number[] = [];
  const re = new RegExp("(" + NUM + ")\\s*" + q.unit, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(stem))) out.push(Number(m[1]));
  return out;
}

/** Where a band mentions BMI it must be read as a BMI band, not an age one. */
function scopedToBmi(raw: string, context: string): boolean {
  const at = context.indexOf(raw);
  if (at < 0) return false;
  return /BMI[^|]*$/i.test(context.slice(Math.max(0, at - 40), at));
}

type Finding = { id: number; status: string; kind: string; detail: string };
const findings: Finding[] = [];
function flag(q: Row, kind: string, detail: string) {
  findings.push({ id: q.id, status: q.status, kind, detail });
}

for (const q of all) {
  const prose = proseOf(q);
  const table = q.explanation_table;
  const applied = highlightedRows(table).join("\n");
  const opts = q.options ?? [];
  const keyed = opts.find((o) => o.key === q.correct_key);

  // 1. A highlighted row the patient falls outside. Shared with the
  //    live verification layer so the two cannot drift apart.
  for (const p of appliedBandProblems(q.stem, parseExplanationTable(table))) {
    flag(q, "APPLIED-BAND", p);
  }

  // 2. The explanation calling the patient an age the stem does not give.
  const ages = stemValues(q.stem, { label: "age", unit: "" });
  if (ages.length) {
    const re = new RegExp("(?:^|[^-\\w])(\\d{1,3})\\s*(?:-|\\s)\\s*year\\s*(?:-|\\s)\\s*old", "gi");
    let m: RegExpExecArray | null;
    const seen = new Set<number>();
    while ((m = re.exec(prose))) {
      const n = Number(m[1]);
      if (!ages.includes(n) && !seen.has(n)) {
        seen.add(n);
        flag(q, "AGE-RESTATED", `stem says ${ages.join("/")}, explanation says "${m[0].trim()}"`);
      }
    }
  }

  // 3. Arithmetic that does not add up.
  const addends = Array.from(prose.matchAll(/(?:^|[^\d\w])\+\s?(\d{1,2})\b/g)).map((m) =>
    Number(m[1])
  );
  const totals = Array.from(
    prose.matchAll(
      /(?:total(?:ling|ing)?(?:\s+(?:score|of))?|giving(?:\s+a)?(?:\s+total)?(?:\s+of)?|sums?\s+to|adds?\s+up\s+to|score\s+of)\s*(?:a\s+)?(?:total\s+of\s+)?(\d{1,3})\b/gi
    )
  ).map((m) => Number(m[1]));

  // 4. Where every option is a bare number, the keyed one must be the
  //    number the explanation computes.
  const numeric = opts.length > 0 && opts.every((o) => /^\d+(\.\d+)?$/.test(o.text.trim()));
  if (numeric && totals.length && keyed) {
    const keyedN = Number(keyed.text.trim());
    for (const t of Array.from(new Set(totals))) {
      if (t !== keyedN)
        flag(q, "KEY-VS-TOTAL", `explanation computes ${t}, keyed option is ${keyed.key}. ${keyed.text}`);
    }
  }

  // 5. The explanation naming a letter that is not the keyed one as the
  //    answer. A copy-edit slip here mismarks every candidate.
  if (q.correct_key) {
    const re = /\boption\s+([A-N])\b(?:[^.]{0,40}?)\b(?:is|remains)\s+(?:the\s+)?(?:single\s+)?(?:most\s+)?(?:correct|right|best|appropriate)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prose))) {
      if (m[1].toUpperCase() !== q.correct_key.toUpperCase())
        flag(q, "KEY-VS-PROSE", `keyed ${q.correct_key}, explanation says "${m[0].trim()}"`);
    }
  }

  // 6. Parity that contradicts itself.
  const gp = q.stem.match(/\bG(\d)\s*P(\d)\b/i);
  const nulli = /\bnullipar|primigravid|\bher first pregnancy\b/i.test(q.stem);
  if (gp && nulli && Number(gp[2]) > 0)
    flag(q, "PARITY", `stem says ${gp[0]} but also describes her as nulliparous/primigravid`);
  if (gp && Number(gp[1]) < Number(gp[2]))
    flag(q, "PARITY", `stem says ${gp[0]} — parity exceeds gravidity`);

  // 7. Softer: a band anywhere in the explanation that the patient falls
  //    outside, with none she falls inside. Often legitimate.
  if (soft && ages.length && !applied) {
    const body = prose + "\n" + tableText(table);
    const bands = bandsIn(body, "(?:years?|yrs?)").filter((b) => !scopedToBmi(b.raw, body));
    const outside = bands.filter((b) => ages.every((a) => a < b.lo || a > b.hi));
    const inside = bands.some((b) => ages.some((a) => a >= b.lo && a <= b.hi));
    if (outside.length && !inside)
      flag(
        q,
        "age-band-mention",
        `stem age ${ages.join("/")}; explanation mentions only ${outside.map((b) => b.raw).join(", ")}`
      );
  }
}

// 8. The question line naming an age band the woman in the vignette
//    falls outside. Question 1193 gave a 46-year-old and then asked
//    about oophorectomy "before the age of 45": the figure being asked
//    for did not apply to the patient it had just described.
for (const q of all) {
  const ages = stemValues(q.stem, { label: "age", unit: "" });
  if (!ages.length) continue;
  const sentences = q.stem
    .split(/(?<=\?)\s+|\n+/)
    .filter((s) => s.trim().endsWith("?"));
  for (const line of sentences) {
    for (const b of bandsIn(line, "(?:years?|yrs?)")) {
      if (ages.every((a) => a < b.lo || a > b.hi))
        flag(q, "QUESTION-BAND", `vignette age ${ages.join("/")} outside "${b.raw}" in the question line`);
    }
    // The threshold has to be stated as an age. Without that, "before
    // 22" in a question line is a gestation and flagging it against
    // the woman's age is noise (223, 697, 848 were all weeks).
    const re =
      /\b(?:before|after|under|over|above|below|beyond|younger than|older than|aged over|aged under)\s+(?:the age of\s+(\d{2})|(\d{2})\s*years?)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      const n = Number(m[1] ?? m[2]);
      const word = m[0].toLowerCase();
      const below = /before|under|below|younger/.test(word);
      const ok = below ? ages.some((a) => a < n) : ages.some((a) => a > n);
      if (!ok)
        flag(q, "QUESTION-BAND", `vignette age ${ages.join("/")} fails "${m[0].trim()}" in the question line`);
    }
  }
}

const order = ["APPLIED-BAND", "QUESTION-BAND", "AGE-RESTATED", "KEY-VS-TOTAL", "KEY-VS-PROSE", "PARITY", "age-band-mention"];

console.log(`audited ${all.length} questions\n`);
for (const kind of order) {
  const hits = findings.filter((f) => f.kind === kind);
  if (!hits.length) continue;
  console.log(`${kind} — ${hits.length}`);
  for (const h of hits) console.log(`   #${h.id} (${h.status})  ${h.detail}`);
  console.log();
}
if (!findings.length) console.log("clean on every check.");
else {
  const ids = Array.from(new Set(findings.map((f) => f.id))).sort((a, b) => a - b);
  console.log(`${ids.length} questions carry at least one flag: ${ids.join(" ")}`);
}
