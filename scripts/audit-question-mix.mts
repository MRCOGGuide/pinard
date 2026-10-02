/**
 * What kinds of question the bank asks, against the examples.
 *
 *   npx tsx scripts/audit-question-mix.mts
 *   npx tsx scripts/audit-question-mix.mts 1700   # also the batch from #1700
 *
 * A figure question — "what percentage should she be quoted?" — is a
 * real part of the paper and a small one. A bank that fills up with
 * them tests recall of decimals rather than judgement, and the
 * examples the owner curated are the measure of how often the real
 * paper does it.
 *
 * Classified from the option list and the closing sentence, not by a
 * model: a list that is all numbers is a figure question whatever the
 * sentence says, and "which is the most likely diagnosis" is a
 * diagnosis question whatever the options look like.
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

export type Kind =
  | "figure"
  | "diagnosis"
  | "investigation"
  | "management"
  | "drug"
  | "timing"
  | "other";

/** A figure: a percentage, a rate, a ratio, a number of weeks on its own. */
const NUMERIC_OPTION =
  /^(?:about |approximately |around |over |under |less than |more than |up to |no )?[<>≥≤]?\s?\d/i;
const FIGURE_WORDS =
  /\b(what (?:figure|percentage|proportion|rate|risk|incidence|chance)|which figure|what is the (?:risk|rate|incidence|prevalence|likelihood|chance|proportion)|how (?:likely|common|many|much))\b/i;
const DIAGNOSIS = /\b(most likely (?:diagnosis|cause|underlying)|which diagnosis|what is the diagnosis|most likely to explain)\b/i;
const INVESTIGATION =
  /\b(which (?:single )?(?:investigation|test|imaging|modality)|most appropriate (?:investigation|test|imaging|next investigation))\b/i;
const DRUG = /\b(which (?:drug|agent|medication|antibiotic|preparation)|most appropriate (?:drug|agent|medication))\b/i;
const TIMING = /\b(at what gestation|by what (?:age|gestation)|when should|at what interval|how long)\b/i;
const MANAGEMENT =
  /\b(most appropriate (?:management|next step|treatment|intervention|advice|recommendation|plan|action)|what (?:should|would) (?:you|the team|she) (?:do|be (?:told|offered)))\b/i;

export function classify(stem: string, options: { text: string }[]): Kind {
  const numeric = options.filter((o) => NUMERIC_OPTION.test(o.text.trim())).length;
  if (options.length >= 3 && numeric / options.length >= 0.6) return "figure";
  const closing = stem.trim().split(/(?<=[.?!])\s+/).slice(-2).join(" ");
  if (FIGURE_WORDS.test(closing)) return "figure";
  if (DIAGNOSIS.test(closing)) return "diagnosis";
  if (INVESTIGATION.test(closing)) return "investigation";
  if (DRUG.test(closing)) return "drug";
  if (TIMING.test(closing)) return "timing";
  if (MANAGEMENT.test(closing)) return "management";
  return "other";
}

function tally(
  rows: { stem: string; options: { text: string }[] }[],
  label: string
) {
  const counts = new Map<Kind, number>();
  for (const r of rows) {
    const kind = classify(r.stem ?? "", r.options ?? []);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  console.log(`\n${label} (${rows.length})`);
  for (const [kind, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const share = ((n * 100) / rows.length).toFixed(0).padStart(3);
    console.log(`  ${share}%  ${String(n).padStart(4)}  ${kind}`);
  }
}

/* The examples the owner curated, which are the standard. */
const { data: examples } = await db
  .from("example_questions")
  .select("id, stem, options, format");
tally(
  ((examples ?? []) as unknown as { stem: string; options: { text: string }[] }[]),
  "EXAMPLES"
);

const bank = await fetchAll<{
  id: number;
  format: string;
  stem: string;
  options: { text: string }[];
}>((from, to) =>
  db
    .from("generated_questions")
    .select("id, format, stem, options")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

tally(bank, "THE BANK");
tally(bank.filter((r) => r.format === "emq"), "THE BANK — EMQ scenarios");

const from = Number(process.argv[2]);
if (Number.isFinite(from)) {
  tally(bank.filter((r) => r.id >= from), `THE BANK — from #${from}`);
}
