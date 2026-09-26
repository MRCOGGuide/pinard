/**
 * Correct a misspelling everywhere a candidate can read it.
 *
 *   npx tsx scripts/fix-spelling.mts neuroaxial neuraxial
 *   npx tsx scripts/fix-spelling.mts neuroaxial neuraxial --apply
 *
 * "neuroaxial" reached two explanations because the source article
 * spells it that way; the rest of the library spells it neuraxial, in
 * 82 passages across 25 documents. A question copies its source's
 * medicine, not its typing.
 *
 * Case is preserved at the start of the word, so a sentence that opens
 * on the term is not lower-cased. Everything else about the text is
 * left alone.
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
const [wrong, right] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!wrong || !right) throw new Error("usage: fix-spelling.mts <wrong> <right> [--apply]");

const re = new RegExp(wrong, "gi");
const correct = (text: string) =>
  text.replace(re, (m) => (m[0] === m[0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right));

type Row = {
  id: number;
  status: string;
  stem: string | null;
  lead_in: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, stem, lead_in, options, explanations, explanation")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

let changed = 0;
for (const r of rows) {
  const patch: Record<string, unknown> = {};
  for (const field of ["stem", "lead_in", "explanation"] as const) {
    const text = r[field];
    if (text && re.test(text)) patch[field] = correct(text);
  }
  for (const field of ["options", "explanations"] as const) {
    const list = r[field];
    if (!list?.some((x) => re.test(x.text))) continue;
    patch[field] = list.map((x) => ({ ...x, text: correct(x.text) }));
  }
  if (Object.keys(patch).length === 0) continue;
  changed++;
  console.log(`#${r.id} (${r.status}) ${Object.keys(patch).join(", ")}`);
  for (const value of Object.values(patch)) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const at = text.toLowerCase().indexOf(right.toLowerCase());
    console.log(`   …${text.slice(Math.max(0, at - 70), at + 90).replace(/\s+/g, " ")}…`);
  }
  if (apply) {
    const { error } = await db.from("generated_questions").update(patch).eq("id", r.id);
    if (error) throw new Error(`#${r.id}: ${error.message}`);
  }
}

console.log(
  `\n${changed} question(s) spell it "${wrong}"${apply ? " — corrected" : " (not saved)"}`
);
