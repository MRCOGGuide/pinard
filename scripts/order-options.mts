/**
 * Put the options of questions already in the bank into exam order.
 *
 * The RCOG spec: options "will nearly always be listed in alphabetical
 * or numerical order for ease of reference". The exemplar bank follows
 * it 84% of the time; the generated bank followed it 8% of the time,
 * because generation shuffled the options to keep the correct answer
 * off a predictable letter. Sorting does that job equally well — a
 * letter is decided by the option's own text, which has nothing to do
 * with whether it is the answer — and produces a list that looks like
 * the paper.
 *
 * The same reordering as generation now applies, through the same
 * function, so the bank and anything generated after it agree.
 *
 * An EMQ set shares one option list across its scenarios, so the remap
 * is computed once per set and applied to every scenario in it; doing
 * it row by row would letter the same list differently under each
 * scenario.
 *
 *   npx tsx scripts/order-options.mts --dry
 *   npx tsx scripts/order-options.mts
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
const { orderOptions } = await import("../src/lib/generation");

const DRY = process.argv.includes("--dry");
const db = createAdminClient();

type Row = {
  id: number;
  format: string;
  status: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: { key: string; [k: string]: unknown }[];
  emq_group_id: string | null;
};

const { data } = await db
  .from("generated_questions")
  .select("id, format, status, options, correct_key, explanations, emq_group_id")
  .in("status", ["approved", "pending"])
  .order("id");
const rows = (data ?? []) as Row[];

/** One remap per EMQ set; SBAs are their own group of one. */
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const key = r.emq_group_id ? `set:${r.emq_group_id}` : `q:${r.id}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
}

let changed = 0;
let untouched = 0;
const samples: string[] = [];

for (const [, members] of groups) {
  const first = members[0];
  const { options, remap } = orderOptions(first.options ?? []);

  const alreadyOrdered = (first.options ?? []).every(
    (o, i) => o.key === options[i].key && o.text === options[i].text
  );
  if (alreadyOrdered) {
    untouched += members.length;
    continue;
  }

  for (const r of members) {
    const explanations = (r.explanations ?? []).map((e) => ({
      ...e,
      key: remap.get(e.key) ?? e.key,
    }));
    const correct = remap.get(r.correct_key) ?? r.correct_key;

    if (samples.length < 4) {
      const was = (r.options ?? [])
        .slice(0, 3)
        .map((o) => `${o.key}. ${o.text.slice(0, 26)}`)
        .join(" | ");
      const now = options
        .slice(0, 3)
        .map((o) => `${o.key}. ${o.text.slice(0, 26)}`)
        .join(" | ");
      samples.push(
        `  ${r.id} (${r.format}/${r.status}) answer ${r.correct_key} -> ${correct}\n     was: ${was}\n     now: ${now}`
      );
    }

    if (!DRY) {
      const { error } = await db
        .from("generated_questions")
        .update({ options, correct_key: correct, explanations })
        .eq("id", r.id);
      if (error) {
        console.log(`  ${r.id}: write failed — ${error.message}`);
        continue;
      }
    }
    changed++;
  }
}

console.log(
  `${rows.length} questions in ${groups.size} option list(s) | ${changed} reordered, ${untouched} already in order${DRY ? " — DRY RUN" : ""}\n`
);
for (const s of samples) console.log(s);
