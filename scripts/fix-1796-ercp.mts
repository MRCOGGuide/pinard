/**
 * Write ERCP out in #1796's option list.
 *
 *   npx tsx scripts/fix-1796-ercp.mts
 *   npx tsx scripts/fix-1796-ercp.mts --apply
 *
 * The option read "ERCP" and nothing else, which is the one place an
 * abbreviation cannot be guessed from its surroundings: an option is a
 * line on its own. Expanded once, where it first appears, as this bank
 * expands everything else — the explanation keeps the short form,
 * because by then the candidate has read it.
 *
 * An EMQ's options belong to the set, so this writes to all three
 * scenarios; the answer keys move with the text, not the letter.
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

const GROUP = "3f973cbf-6fb7-4876-8af4-05022bccaf62";
const FROM = "ERCP";
const TO = "Endoscopic retrograde cholangiopancreatography (ERCP)";

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options")
  .eq("emq_group_id", GROUP)
  .order("id");
if (!rows?.length) throw new Error("set not found");

for (const row of rows) {
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answerText = options.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no answer text`);

  const next = options
    .map((o) => (o.text === FROM ? { ...o, text: TO } : o))
    /* Still ordered by what the option says, now that it says more. */
    .sort((a, b) => a.text.localeCompare(b.text))
    .map((o, i) => ({ key: String.fromCharCode(65 + i), text: o.text }));

  const wanted = answerText === FROM ? TO : answerText;
  const key = next.find((o) => o.text === wanted)?.key;
  if (!key) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  console.log(`#${row.id}  ${row.correct_key} -> ${key}  ${wanted}`);

  if (apply) {
    const { data: full } = await db
      .from("generated_questions")
      .select("explanations")
      .eq("id", row.id)
      .single();
    const explanations = (full?.explanations ?? []) as { key: string; text: string }[];
    const { error } = await db
      .from("generated_questions")
      .update({
        options: next,
        correct_key: key,
        explanations: explanations.map((e) =>
          e.key === row.correct_key ? { ...e, key } : e
        ),
      })
      .eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
