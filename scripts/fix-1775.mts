/**
 * #1775 quoted a maternal mortality rate two reports out of date.
 *
 *   npx tsx scripts/fix-1775.mts
 *   npx tsx scripts/fix-1775.mts --apply
 *
 * It asked for "the most recently reported UK maternal mortality rate"
 * and answered 8.76 per 100 000 maternities — the 2017 enquiry, for
 * deaths in 2013–15. The library holds the next one: "There was a
 * statistically non-significant increase in the overall maternal death
 * rate in the UK between 2015–17 and 2018–20 … which is now 10.90 per
 * 100 000 maternities (95% CI 9.53–12.40)."
 *
 * A confidential enquiry is republished every three years, so a figure
 * from one is only right until the next. The old figure does not leave
 * the question: it becomes the distractor, because quoting the
 * triennium you happened to learn is exactly the mistake.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const GROUP = "4fd4377f-fde0-4054-993c-bb830b229da2";

/** Ordered by size, with the superseded rate kept as a distractor. */
const OPTIONS = [
  { key: "A", text: "1 per 100 000 maternities" },
  { key: "B", text: "2 per 100 000 deliveries" },
  { key: "C", text: "2 per 100 000 maternities" },
  { key: "D", text: "5 per 100 000 maternities" },
  { key: "E", text: "8.76 per 100 000 maternities" },
  { key: "F", text: "10.90 per 100 000 maternities" },
  { key: "G", text: "10-fold increase" },
  { key: "H", text: "20-fold increase" },
  { key: "I", text: "44%" },
  { key: "J", text: "56%" },
  { key: "K", text: "84%" },
];

/** The 2022 enquiry's key-facts passage. */
const CITES = [13774];
const EXPLANATION =
  "The UK maternal mortality rate from direct and indirect causes is 10.90 per 100 000 maternities (95% CI 9.53–12.40) for 2018–20, the most recent triennium reported; excluding the deaths directly attributable to COVID-19 it is 10.47. The enquiry is republished every three years, so the rate learned from an earlier one — 8.76 for 2013–15 — is the commonest thing to quote by mistake.";

const { data: rows } = await db
  .from("generated_questions")
  .select("id, stem, correct_key, options, explanations, source_document_ids")
  .eq("emq_group_id", GROUP)
  .order("id");
if (!rows?.length) throw new Error("set not found");

const problems = [
  ...selfTalkProblems(EXPLANATION),
  ...ukEnglishProblems(EXPLANATION),
  ...sourceNarrationProblems(EXPLANATION),
];
if (problems.length) throw new Error(problems.join("; "));

for (const row of rows) {
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answerText = options.find((o) => o.key === row.correct_key)?.text;
  if (!answerText) throw new Error(`#${row.id}: no answer text`);
  /* Re-key by text; #1775 moves to the figure it should have had. */
  const wanted =
    row.id === 1775 ? "10.90 per 100 000 maternities" : answerText;
  const next = OPTIONS.find((o) => o.text === wanted);
  if (!next) throw new Error(`#${row.id}: "${wanted}" is not in the new list`);

  const explanations = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];

  console.log(`#${row.id}  ${row.correct_key} -> ${next.key}  ${next.text}`);

  if (apply) {
    const patch: Record<string, unknown> = {
      options: OPTIONS,
      correct_key: next.key,
      explanations: explanations.map((e) =>
        e.key === row.correct_key
          ? {
              ...e,
              key: next.key,
              ...(row.id === 1775
                ? { text: EXPLANATION, citation_chunk_ids: CITES }
                : {}),
            }
          : e
      ),
    };
    if (row.id === 1775) {
      patch.citation_chunk_ids = CITES;
      patch.source_document_ids = [...new Set([582, ...((row.source_document_ids ?? []) as number[])])];
    }
    const { error } = await db.from("generated_questions").update(patch).eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
