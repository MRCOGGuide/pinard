/**
 * Write to registrars, not to medical students.
 *
 * "A 31-year-old woman with a previous lower segment caesarean section
 * and a body mass index of 42" is how you write for someone meeting the
 * terms for the first time. The reader is an ST5 several years into the
 * specialty who writes LSCS and BMI a dozen times a day, and spelling
 * them out costs them reading speed on a paper that is timed.
 *
 * Deterministic, not a rewrite: the words change, nothing else does. No
 * model is asked to reconsider the medicine, so nothing can drift.
 *
 * Longest phrases first, so "vaginal birth after caesarean section"
 * becomes VBAC rather than "vaginal birth after CS".
 *
 *   npx tsx scripts/abbreviate.mts --dry
 *   npx tsx scripts/abbreviate.mts --pending-only
 *   npx tsx scripts/abbreviate.mts
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
const DRY = args.includes("--dry");
const PENDING_ONLY = args.includes("--pending-only");

/**
 * Order matters. Each phrase is tried against the text as it stands
 * after the previous ones, so the longest form wins its words before a
 * shorter form can claim part of them.
 */
const RULES: { re: RegExp; to: string; label: string }[] = [
  // VBAC, in its several spellings, including one that already glosses.
  {
    re: /\bvaginal\s+birth\s+after\s+(?:previous\s+)?caesarean(?:\s+(?:section|birth|delivery))?\b/gi,
    to: "VBAC",
    label: "vaginal birth after caesarean → VBAC",
  },
  // LSCS before the bare caesarean rule, or it would become "lower segment CS".
  {
    re: /\blower(?:\s+uterine)?[\s-]+segment\s+caesarean\s+(?:section|birth|delivery)s?\b/gi,
    to: "LSCS",
    label: "lower segment caesarean section → LSCS",
  },
  {
    re: /\bbody\s+mass\s+index\b/gi,
    to: "BMI",
    label: "body mass index → BMI",
  },
  {
    re: /\bcaesarean\s+sections?\b/gi,
    to: "CS",
    label: "caesarean section → CS",
  },
];

/** "BMI (BMI)" is what a gloss becomes once its expansion is replaced. */
const GLOSS = /\b(VBAC|LSCS|BMI|CS)\s*\((?:VBAC|LSCS|BMI|CS)\)/g;

/** "a LSCS" reads wrong once the noun is spoken as letters. */
const ARTICLE = /\ba\s+(?=(?:LSCS|MRI|USS|IUD|IUS|ECG|FBC)\b)/g;

export function abbreviate(text: string): string {
  if (!text) return text;
  let out = text;
  for (const rule of RULES) out = out.replace(rule.re, rule.to);
  out = out.replace(GLOSS, "$1");
  out = out.replace(ARTICLE, "an ");
  return out;
}

const db = createAdminClient();
const { data } = await db
  .from("generated_questions")
  .select("id, status, format, stem, lead_in, options, explanations")
  .in("status", PENDING_ONLY ? ["pending"] : ["approved", "pending"])
  .order("id");
const rows = (data ?? []) as Record<string, any>[];

console.log(
  `${rows.length} question(s) in scope${PENDING_ONLY ? " (pending only)" : " (approved + pending)"}${DRY ? " — DRY RUN" : ""}\n`
);

const counts = new Map<string, number>();
function tally(before: string, after: string) {
  if (before === after) return;
  for (const rule of RULES) {
    const hits = (before.match(rule.re) ?? []).length;
    if (hits > 0) counts.set(rule.label, (counts.get(rule.label) ?? 0) + hits);
  }
}

let changed = 0;
const samples: string[] = [];

for (const q of rows) {
  const stem = abbreviate(q.stem ?? "");
  const leadIn = q.lead_in ? abbreviate(q.lead_in) : q.lead_in;
  const options = ((q.options ?? []) as { key: string; text: string }[]).map((o) => ({
    ...o,
    text: abbreviate(o.text ?? ""),
  }));
  const explanations = ((q.explanations ?? []) as { text: string }[]).map((e) => ({
    ...e,
    text: abbreviate((e as { text: string }).text ?? ""),
  }));

  const before = JSON.stringify([q.stem, q.lead_in, q.options, q.explanations]);
  const after = JSON.stringify([stem, leadIn, options, explanations]);
  if (before === after) continue;

  tally(q.stem ?? "", stem);
  for (const [i, o] of ((q.options ?? []) as { text: string }[]).entries()) {
    tally(o.text ?? "", options[i].text);
  }
  for (const [i, e] of ((q.explanations ?? []) as { text: string }[]).entries()) {
    tally(e.text ?? "", explanations[i].text);
  }
  if (q.lead_in) tally(q.lead_in, leadIn as string);

  if (samples.length < 6 && q.stem !== stem) {
    const i = [...q.stem].findIndex((c: string, n: number) => c !== stem[n]);
    const from = Math.max(0, i - 60);
    samples.push(
      `  ${q.id} (${q.format}/${q.status})\n    was: …${String(q.stem).slice(from, i + 70)}…\n    now: …${stem.slice(from, i + 70)}…`
    );
  }

  changed++;
  if (!DRY) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem, lead_in: leadIn, options, explanations })
      .eq("id", q.id);
    if (error) console.log(`  ${q.id}: WRITE FAILED — ${error.message}`);
  }
}

console.log("replacements:");
for (const [label, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}×  ${label}`);
}
console.log("\nsamples:");
for (const s of samples) console.log(s);
console.log(`\n${DRY ? "would change" : "changed"} ${changed} question(s)`);
