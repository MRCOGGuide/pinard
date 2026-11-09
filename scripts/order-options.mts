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
 * is computed once per set and applied to every scenario in it, rejected
 * ones included so the set keeps one list; doing it row by row would
 * letter the same list differently under each scenario. A set whose
 * scenarios no longer carry the same list is left alone and named.
 *
 * Re-lettering an answered question would leave each candidate's stored
 * answer pointing at a different option, so their answers are re-lettered
 * in the same step (owner, 9 November 2026: "yes, re-letter them"). Each
 * question's before and after is kept (keepEdit), and the whole run's
 * before is written to a local file to put it back from.
 *
 *   npx tsx --conditions=react-server scripts/order-options.mts --dry
 *   npx tsx --conditions=react-server scripts/order-options.mts
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
const { keepEdit } = await import("../src/lib/question-edits");

const DRY = process.argv.includes("--dry");
const db = createAdminClient();

type Option = { key: string; text: string };
type Row = {
  id: number;
  format: string;
  status: string;
  options: Option[];
  correct_key: string;
  explanations: { key: string; text?: string; [k: string]: unknown }[];
  emq_group_id: string | null;
};

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, format, status, options, correct_key, explanations, emq_group_id")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...((data ?? []) as Row[]));
  if ((data ?? []).length < 1000) break;
}

/** One remap per EMQ set; SBAs are their own group of one. Rejected SBAs are left as they are. */
const groups = new Map<string, Row[]>();
for (const r of rows) {
  if (!r.emq_group_id && r.status === "rejected") continue;
  const key = r.emq_group_id ? `set:${r.emq_group_id}` : `q:${r.id}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
}

const texts = (options: Option[]) => JSON.stringify((options ?? []).map((o) => [o.key, o.text]));
const backup: { question: Row; answers: { id: number; chosen_key: string }[] }[] = [];
let lists = 0;
let questions = 0;
let answersMoved = 0;
const drifted: number[] = [];
const letterMentions: number[] = [];
const failures: string[] = [];
const samples: string[] = [];

for (const [, members] of groups) {
  if (!members.some((m) => m.status !== "rejected")) continue;
  const first = members[0];
  const { options, remap } = orderOptions(first.options ?? []);
  if (texts(first.options) === texts(options)) continue;
  if (members.some((m) => texts(m.options) !== texts(first.options))) {
    drifted.push(first.id);
    continue;
  }
  lists++;

  for (const r of members) {
    const after = {
      options,
      correct_key: remap.get(r.correct_key) ?? r.correct_key,
      explanations: (r.explanations ?? []).map((e) => ({ ...e, key: remap.get(e.key) ?? e.key })),
    };
    const was = r.options.find((o) => o.key === r.correct_key)?.text;
    const now = options.find((o) => o.key === after.correct_key)?.text;
    if (was !== now) throw new Error(`#${r.id}: the answer would change (${was} → ${now})`);
    if ((r.explanations ?? []).some((e) => /\b(?:options?|answers?|choices?) [A-Z]\b/i.test(String(e.text ?? "")))) letterMentions.push(r.id);

    const { data: answers, error: aErr } = await db.from("user_answers").select("id, chosen_key").eq("question_id", r.id);
    if (aErr) throw aErr;
    backup.push({ question: r, answers: (answers ?? []) as { id: number; chosen_key: string }[] });

    if (samples.length < 4) {
      samples.push(`  #${r.id} (${r.format}/${r.status}) answer ${r.correct_key} -> ${after.correct_key}: ${options.slice(0, 4).map((o) => o.text.slice(0, 24)).join(" | ")}`);
    }
    questions++;
    answersMoved += (answers ?? []).filter((a: any) => (remap.get(a.chosen_key) ?? a.chosen_key) !== a.chosen_key).length;
    if (DRY) continue;

    const { error } = await db.from("generated_questions").update(after).eq("id", r.id);
    if (error) {
      failures.push(`#${r.id}: ${error.message}`);
      continue;
    }
    await keepEdit(r.id, { options: r.options, correct_key: r.correct_key, explanations: r.explanations }, after);
    for (const a of (answers ?? []) as { id: number; chosen_key: string }[]) {
      const key = remap.get(a.chosen_key) ?? a.chosen_key;
      if (key === a.chosen_key) continue;
      const { error: uErr } = await db.from("user_answers").update({ chosen_key: key }).eq("id", a.id).eq("chosen_key", a.chosen_key);
      if (uErr) failures.push(`answer ${a.id} on #${r.id}: ${uErr.message}`);
    }
  }
}

if (!DRY && backup.length) {
  const file = `scripts/_order-options-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(file, JSON.stringify(backup));
  console.log(`before copy: ${file}`);
}
console.log(
  `${lists} option list(s) reordered, ${questions} question(s), ${answersMoved} recorded answer(s) re-lettered${DRY ? " — DRY RUN" : ""}`
);
if (drifted.length) console.log(`left alone, scenarios carry different lists: ${drifted.map((id) => `#${id}`).join(" ")}`);
if (letterMentions.length) console.log(`explanations naming a letter, to read: ${letterMentions.map((id) => `#${id}`).join(" ")}`);
if (failures.length) console.log(`failed:\n  ${failures.join("\n  ")}`);
for (const s of samples) console.log(s);
