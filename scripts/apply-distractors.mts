/**
 * Add proposed distractors to the EMQ sets they were proposed for.
 *
 *   npx tsx scripts/apply-distractors.mts proposals.json --dry
 *   npx tsx scripts/apply-distractors.mts proposals.json
 *
 * The option list is shared by every scenario in a set, so it is written
 * once to the whole group. Adding options renumbers the list — it is
 * kept alphabetical, as the RCOG spec asks — so every scenario's answer
 * and its explanation are re-keyed by matching the option's TEXT, never
 * its old letter.
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

const dry = process.argv.includes("--dry");
const only = process.argv.find((a) => a.startsWith("set:"));

type Proposal = { category: string; text: string; wrongBecause: string };
type Entry = {
  setId: number;
  status: string;
  groupId: string;
  options: { key: string; text: string }[];
  proposals: Proposal[];
};

const entries: Entry[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

let changed = 0;
const skipped: string[] = [];

for (const entry of entries) {
  if (only && entry.setId !== Number(only.slice(4))) continue;
  if (entry.proposals.length === 0) continue;

  const { data: set } = await db
    .from("generated_questions")
    .select("id, correct_key, options, explanations")
    .eq("emq_group_id", entry.groupId)
    .order("id");
  if (!set?.length) {
    skipped.push(`#${entry.setId} — group gone`);
    continue;
  }

  const current = (set[0].options ?? []) as { key: string; text: string }[];
  const seen = new Set(current.map((o) => o.text.trim().toLowerCase()));
  const additions = entry.proposals
    .map((p) => p.text.trim())
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (additions.length === 0) {
    skipped.push(`#${entry.setId} — every proposal already in the list`);
    continue;
  }
  if (current.length + additions.length > KEYS.length) {
    skipped.push(
      `#${entry.setId} — ${current.length + additions.length} options exceeds the ${KEYS.length} letters`
    );
    continue;
  }

  const merged = [...current.map((o) => o.text), ...additions].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  const options = merged.map((text, i) => ({ key: KEYS[i], text }));
  const keyOf = new Map(options.map((o) => [o.text, o.key]));

  console.log(
    `set #${entry.setId} (${entry.status}): ${current.length} -> ${options.length} options`
  );
  for (const t of additions) console.log(`   + ${keyOf.get(t)}. ${t}`);

  let broke = false;
  const rowUpdates: { id: number; correct_key: string; explanations: unknown }[] = [];
  for (const row of set) {
    const oldText = current.find((o) => o.key === row.correct_key)?.text;
    const newKey = oldText ? keyOf.get(oldText) : undefined;
    if (!newKey) {
      skipped.push(`#${entry.setId} — #${row.id} answer ${row.correct_key} has no text to re-key`);
      broke = true;
      break;
    }
    const explanations = (
      (row.explanations ?? []) as { key: string; text: string }[]
    ).map((e) => (e.key === row.correct_key ? { ...e, key: newKey } : e));
    if (newKey !== row.correct_key) {
      console.log(`     #${row.id}: ${row.correct_key} -> ${newKey}`);
    }
    rowUpdates.push({ id: row.id, correct_key: newKey, explanations });
  }
  if (broke) continue;

  if (!dry) {
    for (const u of rowUpdates) {
      const { error } = await db
        .from("generated_questions")
        .update({ correct_key: u.correct_key, explanations: u.explanations })
        .eq("id", u.id);
      if (error) throw new Error(`#${u.id}: ${error.message}`);
    }
    const { error } = await db
      .from("generated_questions")
      .update({ options })
      .eq("emq_group_id", entry.groupId);
    if (error) throw new Error(`#${entry.setId}: ${error.message}`);
  }
  changed++;
}

console.log(`\n${changed} set(s) ${dry ? "would be widened" : "widened"}`);
if (skipped.length) console.log(`\nskipped:\n  ${skipped.join("\n  ")}`);
