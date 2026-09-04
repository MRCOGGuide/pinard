/**
 * One-off: bring existing questions to the single-explanation style.
 *
 * The bank holds questions written when prompt Q asked for a per-option
 * explanation of every option plus a combined paragraph for the card.
 * Prompt Q now asks for one explanation, for the answer, written as the
 * paragraph the candidate reads.
 *
 * Trimming alone would make the cards worse, because the kept text was
 * written as admin working: "This is correct. NICE NG192 explicitly
 * states..." opens by addressing the option and names the guideline the
 * card already prints underneath. So each explanation is rewritten from
 * the passages it already cites, and held to the same lints as a freshly
 * generated one.
 *
 * The question is never touched — stem, options, answer and citations
 * all stay. Only the prose changes, and only within what it already
 * cited, so no new claim can enter the bank.
 *
 *   npx tsx scripts/restyle-explanations.mts --dry     # report only
 *   npx tsx scripts/restyle-explanations.mts           # apply
 *   npx tsx scripts/restyle-explanations.mts --limit 5 # try a few
 */

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

// .env.local is not loaded outside Next, and every import below reads it.
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
const { getChunksByIds } = await import("../src/lib/retrieval");
const {
  extractJson,
  formatPassages,
  ukEnglishProblems,
  sourceNarrationProblems,
} = await import("../src/lib/generation");
const { PROMPT_G, PROMPT_R } = await import("../src/lib/prompts");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? Number(args[i + 1]) : Infinity;
})();

type Explanation = {
  key: string;
  verdict: string;
  text: string;
  citation_chunk_ids: number[];
  source_reference?: string;
};

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanation: string | null;
  explanations: Explanation[];
};

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const { data, error } = await db
  .from("generated_questions")
  .select("id, status, format, stem, options, correct_key, explanation, explanations")
  .in("status", ["approved", "pending"])
  .order("id");
if (error) throw new Error(error.message);

const rows = (data ?? []) as unknown as Row[];

/** Already in the new shape: one explanation, for the answer, no combined field. */
function needsWork(r: Row): boolean {
  const ex = Array.isArray(r.explanations) ? r.explanations : [];
  const extras = ex.filter((e) => e.key !== r.correct_key).length;
  return extras > 0 || Boolean(r.explanation?.trim());
}

const todo = rows.filter(needsWork).slice(0, LIMIT);
console.log(
  `${rows.length} approved/pending questions, ${rows.filter(needsWork).length} need restyling` +
    (LIMIT === Infinity ? "" : ` (taking ${todo.length})`)
);
if (DRY) console.log("DRY RUN — nothing will be written\n");

let done = 0;
let skipped = 0;
let inTokens = 0;
let outTokens = 0;

for (const row of todo) {
  const ex = Array.isArray(row.explanations) ? row.explanations : [];
  const correct = ex.find((e) => e.key === row.correct_key);
  if (!correct) {
    console.log(`  ${row.id}: SKIP — no explanation for correct key ${row.correct_key}`);
    skipped++;
    continue;
  }

  // Only what it already cited: the rewrite may not reach past its own
  // evidence, so it cannot introduce a claim the question never made.
  const passages = await getChunksByIds(correct.citation_chunk_ids);
  if (passages.length === 0) {
    console.log(`  ${row.id}: SKIP — cited chunks no longer exist`);
    skipped++;
    continue;
  }

  const user = [
    `QUESTION:\n${row.stem}`,
    `OPTIONS:\n${row.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${row.correct_key}`,
    `CURRENT EXPLANATION:\n${correct.text}`,
    `SOURCE PASSAGES:\n${formatPassages(passages)}`,
  ].join("\n\n");

  let text = "";
  let problems: string[] = ["not attempted"];
  for (let attempt = 0; attempt < 2 && problems.length > 0; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 600,
      system: PROMPT_G + "\n\n" + PROMPT_R,
      messages: [
        {
          role: "user",
          content:
            attempt === 0
              ? user
              : `${user}\n\nYour previous attempt was rejected for: ${problems.join("; ")}. Rewrite it.`,
        },
      ],
    });
    inTokens += res.usage.input_tokens;
    outTokens += res.usage.output_tokens;

    const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    let parsed: { explanation?: unknown; error?: unknown };
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      problems = ["response was not JSON"];
      continue;
    }
    if (parsed.error === "insufficient_source_material") {
      problems = ["model reported insufficient_source_material"];
      break;
    }
    text = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    // Prompt G tells it to cite everything; the card carries no
    // citations. Prompt R says so, but a stray marker must never reach
    // a candidate, so it is also rejected here.
    problems = text
      ? [
          ...ukEnglishProblems(text),
          ...sourceNarrationProblems(text),
          ...(/\[chunk:\s*\d+\]/i.test(text)
            ? ["citation markers in the prose the candidate reads"]
            : []),
        ]
      : ["empty explanation"];
  }

  if (problems.length > 0 || !text) {
    console.log(`  ${row.id}: SKIP — ${problems.join("; ")}`);
    skipped++;
    continue;
  }

  if (DRY) {
    console.log(`\n  ${row.id} (${row.format}/${row.status}) drops ${ex.length - 1} explanation(s)`);
    console.log(`    was: ${correct.text.slice(0, 150)}`);
    console.log(`    now: ${text}`);
    done++;
    continue;
  }

  const { error: writeError } = await db
    .from("generated_questions")
    .update({
      explanation: "",
      explanations: [{ ...correct, verdict: "correct", text }],
    })
    .eq("id", row.id);
  if (writeError) {
    console.log(`  ${row.id}: WRITE FAILED — ${writeError.message}`);
    skipped++;
    continue;
  }
  done++;
  if (done % 10 === 0) console.log(`  ...${done} rewritten`);
}

const cost = (inTokens / 1e6) * 3 + (outTokens / 1e6) * 15;
console.log(
  `\n${DRY ? "would rewrite" : "rewrote"} ${done}, skipped ${skipped}` +
    ` — ${inTokens} input + ${outTokens} output tokens, about $${cost.toFixed(2)}`
);
