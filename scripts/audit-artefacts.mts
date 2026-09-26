/**
 * Text where the model is talking to itself instead of to a candidate.
 *
 *   npx tsx scripts/audit-artefacts.mts
 *   npx tsx scripts/audit-artefacts.mts --all      # rejected rows too
 *
 * #1602 ended "The oncology team is selecting the most appropriate
 * chemotherapy regimen. She is 44 years old — wait, she is 32 years
 * old. Which chemotherapy regimen is most appropriate for her?" The
 * medicine was right and the age was right; what reached the card was
 * the model correcting itself out loud, in the middle of a vignette a
 * candidate sits an exam on.
 *
 * No model reads this one. Self-talk has a shape — "wait", "actually
 * no", "let me rephrase", "correction:", a chunk id in the prose — and
 * a regex that runs in a second over the whole bank is worth more than
 * a judgement that costs an hour and can be argued with. Anything it
 * matches is read by a person.
 *
 * Every field a candidate can see is scanned, not only the stem: the
 * lead-in, the options, the explanations and the table cells are all
 * prose the same generation wrote.
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
const { selfTalkProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const all = process.argv.includes("--all");

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string | null;
  lead_in: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
  explanation_table: { caption?: string; columns?: string[]; rows?: string[][] } | null;
};

const rows = await fetchAll<Row>((from, to) => {
  const q = db
    .from("generated_questions")
    .select(
      "id, status, format, stem, lead_in, options, explanations, explanation, explanation_table"
    )
    .order("id")
    .range(from, to);
  return all ? q : q.in("status", ["approved", "pending"]);
});

/**
 * The other way a generation leaks: not self-talk but a shape no
 * finished sentence has. A bracket opened and never closed, the same
 * sentence written out twice, an SBA whose stem never asks anything.
 */
function shapeProblems(text: string, where: string, format: string): string[] {
  const problems: string[] = [];
  const opens = (text.match(/\(/g) ?? []).length;
  const closes = (text.match(/\)/g) ?? []).length;
  if (opens !== closes) problems.push(`unbalanced brackets (${opens} open, ${closes} closed)`);

  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 30);
  const seen = new Set<string>();
  for (const sentence of sentences) {
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      problems.push(`says the same sentence twice ("${sentence.slice(0, 70)}…")`);
      break;
    }
    seen.add(key);
  }

  /*
    An SBA stem has to ask something; an EMQ scenario is asked by its
    lead-in. A question mark is not the only way to ask: this bank
    ends stems on "She asks how long she should give the treatment",
    and on a colon before the options complete the sentence. Both are
    the house style and neither is a fault. What is left is a stem
    that stops on a finding and leaves the candidate to guess what is
    being asked.
  */
  const ASKS =
    /\b(asks?|asked|wishes to know|wants to know|would like to know|enquires|enquiring|seeks? (?:advice|clarification)|is (?:asking|counselling)|counsell?ing her about)\b/i;
  if (
    where === "stem" &&
    format === "sba" &&
    !/[?:]$/.test(text.trim()) &&
    !ASKS.test(text)
  ) {
    problems.push("the stem stops on a finding and never asks anything");
  }
  return problems;
}

let faults = 0;
for (const r of rows) {
  const fields: { where: string; text: string }[] = [];
  if (r.stem) fields.push({ where: "stem", text: r.stem });
  if (r.lead_in) fields.push({ where: "lead-in", text: r.lead_in });
  if (r.explanation) fields.push({ where: "explanation", text: r.explanation });
  for (const o of r.options ?? []) fields.push({ where: `option ${o.key}`, text: o.text });
  for (const e of r.explanations ?? [])
    fields.push({ where: `explanation ${e.key}`, text: e.text });
  const t = r.explanation_table;
  if (t) {
    if (t.caption) fields.push({ where: "table caption", text: t.caption });
    for (const c of t.columns ?? []) fields.push({ where: "table column", text: c });
    for (const row of t.rows ?? [])
      for (const cell of row) fields.push({ where: "table cell", text: cell });
  }

  for (const f of fields) {
    const problems = [
      ...selfTalkProblems(f.text ?? ""),
      ...shapeProblems(f.text ?? "", f.where, r.format),
    ];
    if (!problems.length) continue;
    faults++;
    console.log(`#${r.id} (${r.status}, ${r.format}) ${f.where}`);
    for (const p of problems) console.log(`   ${p}`);
    const hit = f.text.search(
      new RegExp(problems[0].match(/"([^"]+)"/)?.[1]?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "$^", "i")
    );
    if (hit >= 0) {
      console.log(`   …${f.text.slice(Math.max(0, hit - 90), hit + 120).replace(/\s+/g, " ")}…`);
    }
  }
}

console.log(
  `\n${rows.length} question(s) read; ${faults} field(s) that are not finished prose`
);
