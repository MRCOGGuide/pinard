/**
 * Write micrograms in full.
 *
 * Nineteen questions wrote the unit as "µg", "μg" or "mcg". UK
 * prescribing standards require micrograms in full precisely because
 * µg misreads as mg, a thousand-fold error, and a revision platform
 * that examines candidates on safe prescribing should not model the
 * notation it warns them against. The rest of the bank already writes
 * it out, so this is also the bank agreeing with itself.
 *
 * Meaning is untouched: only the unit token changes.
 *
 *   npx tsx scripts/normalise-micrograms.mts          # dry run
 *   npx tsx scripts/normalise-micrograms.mts --apply
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
const apply = process.argv.includes("--apply");

// U+00B5 micro sign and U+03BC greek small letter mu, plus "mcg".
const UNIT = /(µg|μg|\bmcg\b)/gi;

function fix(text: string | null): string | null {
  if (typeof text !== "string") return text;
  return text.replace(UNIT, "micrograms");
}

type Row = {
  id: number;
  status: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, stem, lead_in, options, explanations, explanation")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

let changed = 0;
for (const q of all) {
  const patch: Record<string, unknown> = {};
  const stem = fix(q.stem);
  if (stem !== q.stem) patch.stem = stem;
  const lead = fix(q.lead_in);
  if (lead !== q.lead_in) patch.lead_in = lead;
  const explanation = fix(q.explanation);
  if (explanation !== q.explanation) patch.explanation = explanation;

  const options = (q.options ?? []).map((o) => ({ ...o, text: fix(o.text) as string }));
  if (JSON.stringify(options) !== JSON.stringify(q.options ?? [])) patch.options = options;

  const explanations = (q.explanations ?? []).map((e) => ({ ...e, text: fix(e.text) as string }));
  if (JSON.stringify(explanations) !== JSON.stringify(q.explanations ?? []))
    patch.explanations = explanations;

  if (!Object.keys(patch).length) continue;
  changed++;
  console.log(`#${q.id} (${q.status})  ${Object.keys(patch).join(", ")}`);
  for (const line of JSON.stringify(patch).matchAll(/[^"]{0,26}micrograms[^"]{0,12}/g))
    console.log(`     ${line[0]}`);
  if (apply) {
    const { error } = await db.from("generated_questions").update(patch).eq("id", q.id);
    if (error) throw error;
  }
}

console.log(`\n${changed} questions ${apply ? "updated" : "would change (dry run)"}`);
