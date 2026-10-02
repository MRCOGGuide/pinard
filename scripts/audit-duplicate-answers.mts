/**
 * The same answer marked correct in two different sets.
 *
 *   npx tsx scripts/audit-duplicate-answers.mts
 *
 * #1974 was revised because a woman was still on magnesium three days
 * after delivery. Reading its neighbours turned up #1962, which teaches
 * the same rule, halve the maintenance infusion when the kidneys are
 * failing, in a transplant scenario rather than a pre-eclampsia one.
 * Both are in section 35, so a candidate can meet the rule twice in one
 * sitting and get the second one free.
 *
 * This catches the textual case: two questions in the same section whose
 * marked answers reduce to the same content words. It does NOT catch
 * #1962 against #1974, whose answers read "Halve the maintenance
 * infusion rate" and "Reduce magnesium sulphate infusion to 0.5
 * g/hour" — same decision, no shared words. Conceptual duplication
 * needs a model and a reader; this is the floor, not the ceiling.
 *
 * Report only, and nothing it finds should be acted on automatically.
 * Deciding which of a pair to lose, or what the survivor should ask
 * instead, is an editorial judgement about what the bank covers.
 *
 * Skips answers under four words: a bare figure is the answer to many
 * questions and "3-5%" recurring is not a duplicate. Groups EMQ
 * scenarios by their set, because a shared option list puts the same
 * text on every row of it by design.
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

/** Words that carry no subject, so two answers are not matched on them. */
const EMPTY = new Set([
  "should", "with", "that", "this", "than", "from", "their", "will", "after",
  "before", "when", "most", "appropriate", "management", "woman", "women",
]);

const key = (text: string) =>
  (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])
    .filter((w) => !EMPTY.has(w))
    .sort()
    .join(" ");

type Row = {
  id: number;
  status: string;
  section_id: number;
  emq_group_id: string | null;
  correct_key: string;
  stem: string;
  options: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, section_id, emq_group_id, correct_key, stem, options")
    .neq("status", "rejected")
    .order("id")
    .range(from, to)
);

const byAnswer = new Map<string, { id: number; status: string; text: string; set: string }[]>();
for (const r of rows) {
  const answer = (r.options ?? []).find((o) => o.key === r.correct_key)?.text ?? "";
  if (answer.split(/\s+/).filter(Boolean).length < 4) continue;
  const k = key(answer);
  if (k.split(" ").length < 3) continue;
  const list = byAnswer.get(`${r.section_id}|${k}`) ?? [];
  list.push({ id: r.id, status: r.status, text: answer, set: r.emq_group_id ?? `q${r.id}` });
  byAnswer.set(`${r.section_id}|${k}`, list);
}

let found = 0;
for (const list of byAnswer.values()) {
  if (new Set(list.map((x) => x.set)).size < 2) continue;
  found += 1;
  console.log(list.map((x) => `#${x.id} ${x.status}`).join("  "));
  console.log(`   ${list[0].text.slice(0, 110)}`);
}

console.log(`\n${rows.length} questions read, ${found} answer(s) marked correct in more than one set`);
