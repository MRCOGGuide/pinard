/**
 * What can be reached with the key that ships to the browser.
 *
 *   npx tsx scripts/audit-rls.mts
 *
 * Every table in this schema has `enable row level security` on it,
 * which is worth exactly nothing on its own: RLS enabled with a
 * permissive policy is an open table, and the only way to know what a
 * stranger can read is to ask as one.
 *
 * So this holds the anon key — the one in NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * which is in every page this site serves — and tries to read and write
 * every table, signed out. Anything that answers is a finding.
 *
 * Writes are probed with a payload that would violate a constraint even
 * if it were allowed through, so a table that permits the insert fails
 * on the column rather than gaining a row. The two errors are told
 * apart: "permission denied" or an empty RLS refusal is the wall
 * holding; a constraint complaint means the wall let it past and the
 * database caught it instead.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) throw new Error("No Supabase URL or anon key in .env.local");

const supabase = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * What a signed-out visitor is supposed to get from each table.
 *
 * "nothing" is the answer almost everywhere: this app reads on the
 * user's behalf through server actions, and the only thing the browser
 * key is for is signing in. Where a table is deliberately readable,
 * that is written here with the reason, so a policy that opens one by
 * accident is not waved through as expected.
 */
const TABLES: { name: string; anonMayRead: boolean; why?: string }[] = [
  { name: "profiles", anonMayRead: false },
  { name: "sections", anonMayRead: false },
  { name: "content_documents", anonMayRead: false },
  { name: "content_chunks", anonMayRead: false },
  { name: "example_questions", anonMayRead: false },
  { name: "generated_questions", anonMayRead: false },
  { name: "key_facts", anonMayRead: false },
  { name: "user_answers", anonMayRead: false },
  { name: "user_topic_performance", anonMayRead: false },
  { name: "user_question_flags", anonMayRead: false },
  { name: "study_plans", anonMayRead: false },
  { name: "chat_messages", anonMayRead: false },
  { name: "notifications_log", anonMayRead: false },
  { name: "subscriptions", anonMayRead: false },
  { name: "billing_prices", anonMayRead: false },
  { name: "exam_availability", anonMayRead: false },
  { name: "app_settings", anonMayRead: false },
  { name: "ask_credits", anonMayRead: false },
  { name: "ask_usage", anonMayRead: false },
  { name: "generation_jobs", anonMayRead: false },
  { name: "generation_failures", anonMayRead: false },
  { name: "superseded_reviews", anonMayRead: false },
  { name: "invite_codes", anonMayRead: false },
  { name: "invite_redemptions", anonMayRead: false },
  { name: "waitlist", anonMayRead: false },
  { name: "feedback", anonMayRead: false },
];

/**
 * Two states this cannot tell apart, and neither is a finding.
 *
 * "Could not find the table in the schema cache" is what PostgREST
 * says both for a table that does not exist yet — some arrive with a
 * later migration — and for one the anon role cannot see at all.
 * Either way a stranger reaches nothing, which is the question being
 * asked here; run preflight.mts to learn which of the two it is.
 */
const MISSING = /relation .* does not exist|could not find the table|schema cache/i;
const DENIED = /permission denied|violates row-level security|insufficient/i;

type Finding = { table: string; what: string };
const findings: Finding[] = [];
const absent: string[] = [];
let checked = 0;

for (const table of TABLES) {
  const { data, error } = await supabase.from(table.name).select("*").limit(1);

  if (error && MISSING.test(error.message)) {
    absent.push(table.name);
    continue;
  }
  checked += 1;

  const rows = data?.length ?? 0;
  if (error) {
    if (!DENIED.test(error.message)) {
      findings.push({
        table: table.name,
        what: `read failed in a way that is not a refusal: ${error.message}`,
      });
    }
  } else if (rows > 0 && !table.anonMayRead) {
    findings.push({
      table: table.name,
      what: `a signed-out reader got ${rows} row(s)`,
    });
  } else if (rows === 0 && table.anonMayRead) {
    findings.push({
      table: table.name,
      what: `expected to be readable (${table.why ?? "no reason recorded"}) and returned nothing`,
    });
  }

  /*
    The write probe. An empty object is rejected by every table here on
    a not-null column, so the only thing that distinguishes them is
    WHICH complaint comes back.
  */
  const { error: writeError } = await supabase.from(table.name).insert({});
  if (!writeError) {
    findings.push({ table: table.name, what: "a signed-out writer inserted a row" });
  } else if (!DENIED.test(writeError.message)) {
    findings.push({
      table: table.name,
      what: `write reached the database and was stopped by a constraint, not by a policy: ${writeError.message.slice(0, 90)}`,
    });
  }
}

console.log(`${checked} table(s) probed with the browser's own key, signed out.`);
if (absent.length) {
  console.log(`\nunreachable, which here means absent or unexposed: ${absent.join(", ")}`);
}

if (findings.length === 0) {
  console.log("\nNothing readable and nothing writable. The wall holds.");
} else {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of findings) console.log(`  ${f.table}: ${f.what}`);
}

process.exit(findings.length === 0 ? 0 : 1);
