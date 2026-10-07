/**
 * Build repairs written by a person, as proposals repair-queue can apply.
 *
 *   npx tsx scripts/hand-repair.mts .review/x-proposals.json .review/x-specs.json
 *   npx tsx scripts/repair-queue.mts --apply --proposals .review/x-proposals.json
 *
 * The spec is a list of edits made against the text as it stands:
 *
 *   [{ "id": 1668,
 *      "stem": [["old words", "new words"]],
 *      "options": { "F": "16.7–19.6%" },
 *      "correct_key": "C",
 *      "explanation": [["old words", "new words"]] }]
 *
 * "explanation" may instead be the whole new text of the correct
 * option's explanation. Every replacement must find its old words, or
 * that question is skipped: an edit written against text that has
 * since changed is not guessed at.
 *
 * Why a separate tool. The model repairs went wrong in ways reading
 * caught: duplicate options, an answer key the explanation contradicted,
 * a sibling's answer reworded out of an EMQ list. When the fault is
 * already understood, the person who understood it should write the
 * repair, and this puts that repair through the same checks the
 * generator's own output must pass, then the figure check against the
 * question's cited passages, before it becomes a proposal.
 *
 * Options are only checked when the spec changes them: an older
 * question whose options predate the length rule is not refused for a
 * repair to its explanation. An option changed here changes this row
 * only; a shared EMQ option is changed with set-option.mts.
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
const g = await import("../src/lib/generation");
const db = createAdminClient();

const [file, specFile] = process.argv.slice(2);
if (!file || !specFile) {
  console.log("usage: hand-repair.mts <proposals.json> <specs.json>");
  process.exit(1);
}

type Spec = {
  id: number;
  correct_key?: string;
  stem?: [string, string][];
  options?: Record<string, string>;
  explanation?: string | [string, string][];
};
const specs = JSON.parse(fs.readFileSync(specFile, "utf8")) as Spec[];
let list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];

for (const s of specs) {
  const { data: q } = await db
    .from("generated_questions")
    .select("stem, options, correct_key, explanations, status, citation_chunk_ids, explanation_table")
    .eq("id", s.id)
    .single();
  if (!q) {
    console.log(`Q${s.id}: not found`);
    continue;
  }
  const missing: string[] = [];

  let stem = q.stem as string;
  for (const [from, to] of s.stem ?? []) {
    if (!stem.includes(from)) missing.push(`stem: "${from.slice(0, 60)}"`);
    stem = stem.replace(from, to);
  }

  const options = (q.options as { key: string; text: string }[]).map((o) =>
    s.options?.[o.key] !== undefined ? { ...o, text: s.options[o.key] } : o
  );
  for (const k of Object.keys(s.options ?? {}))
    if (!options.some((o) => o.key === k)) missing.push(`option ${k}`);

  const old = q.explanations.find((e: { key: string }) => e.key === q.correct_key);
  const key = s.correct_key ?? q.correct_key;
  let text = old.text as string;
  if (typeof s.explanation === "string") text = s.explanation;
  else
    for (const [from, to] of s.explanation ?? []) {
      if (!text.includes(from)) missing.push(`explanation: "${from.slice(0, 60)}"`);
      text = text.replace(from, to);
    }

  if (missing.length) {
    console.log(`Q${s.id}: skipped, text not found: ${missing.join("; ")}`);
    continue;
  }

  const problems = [
    ...g.explanationLengthProblems(text),
    ...g.ukEnglishProblems(stem + "\n" + text),
    ...g.emDashProblems(stem + "\n" + text),
    ...(s.options ? g.optionSentenceProblems(options) : []),
    ...g.answerInStemProblems(stem, options, key),
  ];

  /* The figure check, against what this question cites. A figure from
     the vignette or the options counts as given, as it does in
     generation. */
  const explanations = [{ ...old, key, text }];
  const ids = Array.from(
    new Set([
      ...(q.citation_chunk_ids ?? []),
      ...explanations.flatMap((e: { citation_chunk_ids?: number[] }) => e.citation_chunk_ids ?? []),
    ])
  );
  const { data: chunks } = await db.from("content_chunks").select("id, text").in("id", ids);
  const passages = (chunks ?? []).map((c: { id: number; text: string }) => ({ chunk_id: c.id, text: c.text }));
  const figures = g.citedFigureProblems(
    explanations.map((e: { text: string; citation_chunk_ids?: number[] }) => ({
      text: e.text,
      citation_chunk_ids: e.citation_chunk_ids ?? [],
    })),
    ids,
    passages as never,
    [stem, ...options.map((o) => o.text)]
  );

  if (problems.length) {
    console.log(`Q${s.id}: refused: ${problems.join(" | ")}`);
    continue;
  }
  /* The figure check reports rather than refuses: a table that runs its
     citation numbers into its figures ("8.8–9.536,48") reads as a
     figure the passage lacks. Read the passage and decide. */
  if (figures.length) console.log(`Q${s.id}: figure check: ${figures.join(" | ")}`);

  list = list.filter((p: { id: number }) => p.id !== s.id);
  list.push({
    id: s.id,
    before: {
      stem: q.stem,
      options: q.options,
      correct_key: q.correct_key,
      explanations: q.explanations,
      status: q.status,
      explanation_table: q.explanation_table ?? null,
    },
    after: { stem, options, correct_key: key, explanations, citation_chunk_ids: q.citation_chunk_ids },
    siblingIds: [],
  });
  console.log(`Q${s.id}: proposal saved`);
}
fs.writeFileSync(file, JSON.stringify(list, null, 1));
