/**
 * Give a question the table its guidance already is.
 *
 * Where the passages stratify — three risks of surgical abortion that
 * only mean anything against each other, four bands of bile acids each
 * with its own timing — the explanation is asked for the table as well
 * as the prose, and the row the question turns on is marked so the
 * answer is seen among its neighbours. That neighbour is usually the
 * distractor: 1 in 100 is cervical injury, sitting one row above the
 * 1-4 in 1000 the question actually wants.
 *
 * Only offered a question whose passages contain one. The model is told
 * to decline rather than manufacture rows, every cell is checked
 * against the passages before it is written, and a table that fails
 * that check is dropped while the question is left exactly as it was.
 *
 *   npx tsx scripts/add-explanation-tables.mts --dry
 *   npx tsx scripts/add-explanation-tables.mts --id 166
 *   npx tsx scripts/add-explanation-tables.mts
 */

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

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
const { getChunksByIds, retrieveChunks } = await import("../src/lib/retrieval");
const { extractJson, formatPassages, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);
const { parseExplanationTable, ungroundedCells } = await import(
  "../src/lib/explanationTable"
);
const { PROMPT_G, PROMPT_T } = await import("../src/lib/prompts");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY = (() => {
  const i = args.indexOf("--id");
  return i >= 0 ? Number(args[i + 1]) : null;
})();
const NEIGHBOURS = 3;
const SEARCH_WIDTH = 10;

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let query = db
  .from("generated_questions")
  .select(
    "id, status, format, stem, options, correct_key, explanations, explanation_table, section_id"
  )
  .in("status", ["approved", "pending"])
  .order("id");
if (ONLY !== null) query = query.eq("id", ONLY);
const { data } = await query;

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: { key: string; text: string; citation_chunk_ids: number[] }[];
  explanation_table: unknown;
  section_id: number;
};
const rows = (data ?? []) as unknown as Row[];

let added = 0;
let declined = 0;
let rejected = 0;

for (const q of rows) {
  if (parseExplanationTable(q.explanation_table)) continue; // already has one

  const correct = q.explanations?.find((e) => e.key === q.correct_key);
  if (!correct?.citation_chunk_ids?.length) continue;

  // The same widening the other passes use: a band table sits chapters
  // away from the flowchart that applies it.
  const cited = await getChunksByIds(correct.citation_chunk_ids);
  if (cited.length === 0) continue;
  const wanted = new Set<number>(correct.citation_chunk_ids);
  const docs = new Set(cited.map((c) => c.document_id));
  for (const c of cited) {
    const { data: near } = await db
      .from("content_chunks")
      .select("id")
      .eq("document_id", c.document_id)
      .gte("chunk_index", c.chunk_index - NEIGHBOURS)
      .lte("chunk_index", c.chunk_index + NEIGHBOURS);
    for (const n of near ?? []) wanted.add(n.id as number);
  }
  try {
    const found = await retrieveChunks(
      `${q.stem}\n${correct.text}`,
      [q.section_id],
      SEARCH_WIDTH
    );
    for (const f of found) if (docs.has(f.document_id)) wanted.add(f.chunk_id);
  } catch {
    // Neighbours alone still carry most tables.
  }
  const passages = await getChunksByIds([...wanted]);

  const user = [
    `QUESTION:\n${q.stem}`,
    `OPTIONS:\n${q.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${q.correct_key}. ${q.options.find((o) => o.key === q.correct_key)?.text ?? ""}`,
    `EXPLANATION:\n${correct.text}`,
    `SOURCE PASSAGES:\n${formatPassages(passages)}`,
  ].join("\n\n");

  const res = await client.messages.create({
    model,
    max_tokens: 1200,
    system: PROMPT_G + "\n\n" + PROMPT_T,
    messages: [{ role: "user", content: user }],
  });
  const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    declined++;
    continue;
  }
  if ((parsed as { none?: unknown })?.none === true) {
    declined++;
    continue;
  }

  const table = parseExplanationTable(
    (parsed as { explanation_table?: unknown })?.explanation_table ?? parsed
  );
  if (!table) {
    declined++;
    continue;
  }

  // A caption says what the table is of, not where it came from: the
  // card already prints the source, and "Table 2, GTG No. 43" is a
  // filing reference the house style forbids everywhere else.
  const captionProblems = sourceNarrationProblems(table.caption);
  if (captionProblems.length > 0) {
    console.log(`  ${q.id}: REJECTED — caption names its source: "${table.caption}"`);
    rejected++;
    continue;
  }

  // Every cell has to be in the passages. A plausible extra row reads
  // as authoritative and nothing in the prose gives it away.
  const bad = ungroundedCells(table, passages.map((p) => p.text));
  if (bad.length > 0) {
    console.log(`  ${q.id}: REJECTED — cells not in the passages: ${bad.slice(0, 4).join(", ")}`);
    rejected++;
    continue;
  }

  console.log(`\n  ${q.id} (${q.format}/${q.status}) — ${table.caption}`);
  console.log(`    ${table.columns.join("  |  ")}`);
  for (const [i, r] of table.rows.entries()) {
    console.log(`    ${r.join("  |  ")}${table.highlight === i ? "   <-- this question" : ""}`);
  }

  if (!DRY) {
    const { error } = await db
      .from("generated_questions")
      .update({ explanation_table: table })
      .eq("id", q.id);
    if (error) {
      console.log(`    WRITE FAILED — ${error.message}`);
      continue;
    }
  }
  added++;
}

console.log(
  `\n${DRY ? "would add" : "added"} ${added} table(s), declined ${declined}, rejected ${rejected}`
);
