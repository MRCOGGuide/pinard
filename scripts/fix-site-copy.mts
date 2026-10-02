/**
 * Em dashes in copy the database holds rather than the repository.
 *
 *   npx tsx scripts/fix-site-copy.mts
 *   npx tsx scripts/fix-site-copy.mts --apply
 *
 * The sweep that took every em dash out of the bank and the pages ran
 * over the codebase, and the monthly plan's note is not in the
 * codebase: it is a row in billing_prices, falling back to the string
 * in pricing.ts only when the row is absent. So "Flexible — cancel any
 * time." stayed on the pricing page, in front of every visitor, after
 * the repository was clean.
 *
 * The admin form that writes these now runs emDashProblems over the
 * note and the cadence, so this is a one-off rather than a chore.
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
const { emDashProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

/* An em dash becomes a colon where it introduces, a comma where it
   interrupts. Nothing here is rewritten beyond that. */
const FIXES: Record<string, string> = {
  "Flexible — cancel any time.": "Flexible: cancel any time.",
};

const { data, error } = await db
  .from("billing_prices")
  .select("tier, cadence, note");
if (error) throw error;

let changed = 0;
for (const row of data ?? []) {
  for (const field of ["note", "cadence"] as const) {
    const text = (row as Record<string, string>)[field];
    if (!text || emDashProblems(text).length === 0) continue;
    const next = FIXES[text];
    if (!next) {
      console.log(`#${row.tier} ${field}: no replacement written for "${text}"`);
      continue;
    }
    if (emDashProblems(next).length) throw new Error("the replacement still has one");
    console.log(`${row.tier} ${field}\n   - ${text}\n   + ${next}`);
    changed += 1;
    if (apply) {
      const { error: e } = await db
        .from("billing_prices")
        .update({ [field]: next })
        .eq("tier", row.tier);
      if (e) throw e;
    }
  }
}

console.log(
  changed === 0
    ? "\nno em dashes in the stored copy"
    : `\n${changed} ${apply ? "saved" : "to save - pass --apply"}`
);
