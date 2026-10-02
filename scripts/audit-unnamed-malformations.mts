/**
 * Explanations that give a malformation RATE and never name the malformation.
 *
 *   npx tsx scripts/audit-unnamed-malformations.mts
 *   npx tsx scripts/audit-unnamed-malformations.mts only:1885
 *
 * #1885 told a woman on lamotrigine monotherapy that her risk of major
 * congenital malformation is 2-5% and stopped. The figure is what the
 * question asked for, but Table 5 of the source sits the pattern in the
 * column beside the rate, cardiac defects and facial clefts, and a
 * pre-conception clinic is exactly where she asks which.
 *
 * Like the unnamed-agents audit this is a teaching audit, not a
 * correctness one: nothing it finds is wrong, each is a card that could
 * carry one more fact at no cost. And like that one it stops at the
 * explanation. Whether the passages name the pattern is the repair's
 * question, and most of what this flags will not be repairable for that
 * reason: the library says mycophenolate is teratogenic and must be
 * substituted, and says no more, so the card cannot either.
 *
 * It also flags, correctly and uselessly, the many explanations whose
 * whole point is avoidance rather than pattern, "ACE inhibitors are
 * teratogenic and must be stopped in pregnancy". The output is a
 * reading list of about twenty-five, not a worklist; read them.
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
const only = process.argv
  .filter((a) => a.startsWith("only:"))
  .flatMap((a) => a.slice(5).split(",").map(Number));

/* Says a risk of malformation exists. */
const RISK = /malformation|teratogen|birth defect|congenital anomal/i;

/*
  Says what the malformation is. Wider than the patterns in the
  epilepsy table, because an explanation that names "incomplete
  virilisation of external genital structures" has already done the
  thing this audit asks for and must not be flagged for not using the
  table's words.
*/
const NAMED =
  /neural tube|spina bifida|anencephal|cardiac defect|congenital heart|cleft|hypospadias|craniofacial|virilisation|limb (?:defect|reduction)|skeletal|renal (?:agenesis|dysplasia|tubular)|ebstein|microcephal|nasal hypoplasia|chondrodysplasia|phocomelia|ventricular septal|septal defect|sacral agenesis|caudal|auditory canal|external ear|skull hypoplasia|oligohydramnios/i;

type Row = {
  id: number;
  status: string;
  format: string;
  correct_key: string;
  explanation: string | null;
  explanations: unknown;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, correct_key, explanation, explanations")
    .order("id")
    .range(from, to)
);

let read = 0;
let flagged = 0;
for (const r of rows) {
  if (only.length && !only.includes(r.id)) continue;

  const parts: string[] = [];
  if (typeof r.explanation === "string") parts.push(r.explanation);
  for (const e of (r.explanations ?? []) as { key: string; text: string }[]) {
    if (e.key === r.correct_key) parts.push(e.text);
  }
  const text = parts.join("\n");
  if (!text) continue;
  read += 1;

  if (!RISK.test(text) || NAMED.test(text)) continue;
  flagged += 1;

  const sentence = text
    .replace(/\s+/g, " ")
    .match(/[^.]*(?:malformation|teratogen|birth defect|congenital anomal)[^.]*\./i);
  console.log(`#${r.id}  ${r.format}/${r.status}`);
  console.log(`   ${sentence?.[0].trim().slice(0, 240) ?? ""}`);
}

console.log(`\n${read} explanation(s) read, ${flagged} name a risk and not its content`);
