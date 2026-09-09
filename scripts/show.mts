/**
 * Print one question in full — stem, options, explanations, tables.
 *
 *   npx tsx scripts/show.mts 1153
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

const db = createAdminClient();

for (const arg of process.argv.slice(2)) {
  const id = Number(arg);
  const { data: q } = await db
    .from("generated_questions")
    .select("*")
    .eq("id", id)
    .single();
  if (!q) {
    console.log(`no question ${id}`);
    continue;
  }
  console.log("=".repeat(70));
  console.log(`#${id}  ${q.format}/${q.status}  topic: ${q.topic ?? "-"}`);
  console.log(`source: ${q.source_title ?? "-"}`);
  console.log("-".repeat(70));
  if (q.lead_in) console.log(`LEAD-IN: ${q.lead_in}\n`);
  console.log(`STEM:\n${q.stem}\n`);
  if (q.scenarios) console.log(`SCENARIOS:\n${JSON.stringify(q.scenarios, null, 2)}\n`);
  console.log("OPTIONS:");
  for (const o of (q.options ?? []) as { key: string; text: string }[]) {
    console.log(`  ${o.key}. ${o.text}${o.key === q.correct_key ? "   <== correct" : ""}`);
  }
  console.log(`\ncorrect_key: ${q.correct_key}`);
  console.log("\nEXPLANATIONS:");
  for (const e of (q.explanations ?? []) as { key: string; text: string }[]) {
    console.log(`  ${e.key}: ${e.text}`);
  }
  for (const field of ["explanation", "teaching_point", "table", "tables", "notes"]) {
    if ((q as Record<string, unknown>)[field]) {
      console.log(`\n${field.toUpperCase()}:`);
      const v = (q as Record<string, unknown>)[field];
      console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
    }
  }
  console.log();
}
