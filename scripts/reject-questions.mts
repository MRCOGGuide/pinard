/**
 * Take named questions out of circulation, with the reason recorded.
 *
 * Rejecting rather than deleting: `rejected` is how this app retires a
 * question, nothing rejected is ever served, and candidates have
 * answered some of these — deleting the rows would take their history
 * with them. The reason goes to generation_failures so the bank keeps
 * an account of why it is one question shorter.
 *
 * Cheaper than re-running the audit with --reject, which would re-check
 * every question in the bank to act on five already known.
 *
 *   npx tsx scripts/reject-questions.mts 29 101 111 133 170 --reason "grounding audit"
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

const args = process.argv.slice(2);
const reasonAt = args.indexOf("--reason");
const reason = reasonAt >= 0 ? args[reasonAt + 1] : "withdrawn";
const ids = args
  .filter((a, i) => reasonAt < 0 || (i < reasonAt && i + 1 !== reasonAt + 1))
  .map(Number)
  .filter((n) => Number.isFinite(n) && n > 0);

if (ids.length === 0) throw new Error("give at least one question id");

const db = createAdminClient();

for (const id of ids) {
  const { data: q } = await db
    .from("generated_questions")
    .select("id, status, section_id, format")
    .eq("id", id)
    .maybeSingle();
  if (!q) {
    console.log(`  ${id}: not found`);
    continue;
  }
  if (q.status === "rejected") {
    console.log(`  ${id}: already rejected`);
    continue;
  }

  const { error } = await db
    .from("generated_questions")
    .update({ status: "rejected" })
    .eq("id", id);
  if (error) {
    console.log(`  ${id}: FAILED — ${error.message}`);
    continue;
  }
  await db.from("generation_failures").insert({
    section_id: q.section_id,
    format: q.format,
    reason: `${reason} (question ${id}, was ${q.status})`,
    raw_response: null,
  });
  console.log(`  ${id}: ${q.status} -> rejected`);
}

for (const s of ["approved", "pending", "rejected"] as const) {
  const { count } = await db
    .from("generated_questions")
    .select("*", { count: "exact", head: true })
    .eq("status", s);
  console.log(`${s}: ${count}`);
}
