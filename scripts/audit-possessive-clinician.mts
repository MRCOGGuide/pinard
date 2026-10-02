/**
 * Clinicians the woman does not own.
 *
 *   npx tsx scripts/audit-possessive-clinician.mts
 *
 * #1785 read "Her neonatologist asks whether additional antenatal
 * corticosteroids should be given". The neonatologist is not hers —
 * she has not met one, and the baby is not born. A hospital specialist
 * drawn into a case is "the neonatologist" or "the neonatology team".
 *
 * Not every possessive is wrong, and the first draft of this list
 * proved it. A woman in the UK has a GP, a named midwife and, in a
 * long illness, a consultant she has seen for years. She also has a
 * surgeon once she is listed for an operation: "she asks her surgeon
 * about the risks of open myomectomy" is how anyone would say it, and
 * eight of this audit's first eleven hits were that. Two more were
 * "her registrar" where "her" was the operating surgeon, whose
 * registrar it is.
 *
 * What is left is the specialist who is not hers to have: a
 * neonatologist before there is a baby, and the people who report on
 * her without meeting her.
 *
 * Pure code. Every hit is still read by a person, because the line is
 * the relationship, not the word.
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

/**
 * Specialists a woman cannot be said to have.
 *
 * Her midwife, her GP, her consultant, her surgeon and the physicians
 * who follow a chronic condition are all deliberately absent: those
 * relationships are real, and three of them exist before the vignette
 * starts.
 */
const NOT_HERS =
  /\b(her|his)\s+(neonatologist|neonatal team|neonatology team|paediatrician|sonographer|radiologist|pathologist|intensivist|scrub nurse|theatre team|on-call (?:consultant|registrar))\b/gi;

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string | null;
  explanations: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

let faults = 0;
for (const r of rows) {
  const fields: { where: string; text: string }[] = [];
  if (r.stem) fields.push({ where: "stem", text: r.stem });
  for (const e of r.explanations ?? []) {
    fields.push({ where: `explanation ${e.key}`, text: e.text });
  }
  for (const f of fields) {
    const found = [...(f.text.match(NOT_HERS) ?? [])];
    if (found.length === 0) continue;
    faults++;
    console.log(`#${r.id} (${r.status}, ${r.format}) ${f.where}: ${found.join(", ")}`);
    const at = f.text.search(NOT_HERS);
    console.log(`   …${f.text.slice(Math.max(0, at - 70), at + 90).replace(/\s+/g, " ")}…`);
  }
}

console.log(
  `\n${rows.length} question(s) read; ${faults} field(s) give her a specialist of her own`
);
