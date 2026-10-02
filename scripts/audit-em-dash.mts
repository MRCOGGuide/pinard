/**
 * Em dashes, which this bank does not use.
 *
 *   npx tsx scripts/audit-em-dash.mts
 *
 * An em dash reads as an aside, and a question is not the place for
 * one: a candidate under time pressure parses a comma, a colon or a
 * full stop faster, and a dash in an option list is a line break
 * waiting to happen on a phone.
 *
 * En dashes are left alone: "24–28 weeks" and "95% CI 1.8–4.6" are
 * ranges, and a range is what an en dash is for. This counts em
 * dashes only, and the UI copy is checked separately by grepping the
 * source.
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

const DASH = /—/;
const counts = new Map<string, number>();
const questions = new Set<number>();

for (const r of rows) {
  const fields: [string, string][] = [
    ["stem", r.stem ?? ""],
    ["lead-in", r.lead_in ?? ""],
    ["explanation", r.explanation ?? ""],
    ...(r.options ?? []).map((o) => [`option ${o.key}`, o.text] as [string, string]),
    ...(r.explanations ?? []).map((e) => [`explanation ${e.key}`, e.text] as [string, string]),
  ];
  for (const [where, text] of fields) {
    if (!DASH.test(text)) continue;
    const kind = where.startsWith("option")
      ? "options"
      : where.startsWith("explanation")
        ? "explanations"
        : where;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    questions.add(r.id);
  }
}

console.log(`${rows.length} question(s) read; ${questions.size} contain an em dash\n`);
for (const [where, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${where}`);
}
