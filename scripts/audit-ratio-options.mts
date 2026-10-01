/**
 * Option lists that ask a candidate to recall a ratio.
 *
 *   npx tsx scripts/audit-ratio-options.mts
 *
 * #1740–#1742 offered "HR 14.33 (95% CI 9.03–22.70)" against "HR 18.49
 * (95% CI 17.12–19.96)". Telling those apart is remembering a decimal,
 * not counselling a woman, and the house rule is to ask for the
 * magnitude a clinician says out loud and keep the ratio under the
 * answer.
 *
 * Options only. A ratio in an explanation is where it belongs.
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
  emq_group_id: string | null;
  stem: string;
  options: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, emq_group_id, stem, options")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

/** A ratio written as one: a named estimate with a number after it. */
const RATIO =
  /\b(?:adjusted\s+)?(?:HR|RR|OR|aOR|aHR|IRR|SMR|hazard ratio|risk ratio|odds ratio|relative risk)\b\s*(?:of\s*)?[=:]?\s*\d/i;
/** Or a bare confidence interval, which only a ratio or a rate carries. */
const INTERVAL = /\b95%\s*CI\b/i;

const seen = new Set<string>();
let faults = 0;
for (const r of rows) {
  const options = r.options ?? [];
  if (options.length < 3) continue;
  const ratios = options.filter((o) => RATIO.test(o.text) || INTERVAL.test(o.text));
  if (ratios.length < 2) continue;
  /* An EMQ's list belongs to the set, so report the set once. */
  const key = r.emq_group_id ?? `q${r.id}`;
  if (seen.has(key)) continue;
  seen.add(key);
  faults++;
  console.log(
    `#${r.id} (${r.status}, ${r.format}) ${ratios.length} of ${options.length} options are ratios`
  );
  for (const o of ratios.slice(0, 3)) console.log(`   ${o.key}. ${o.text.slice(0, 80)}`);
}

console.log(`\n${rows.length} question(s) read; ${faults} list(s) ask for a ratio`);
