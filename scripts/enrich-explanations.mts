/**
 * Make an explanation teach something the option does not already say.
 *
 * The commonest failure is a paraphrase. A question whose answer is "a
 * combination of mifepristone and a prostaglandin preparation" was
 * explained as: the recommended first-line intervention is a
 * combination of mifepristone and a prostaglandin preparation. A
 * candidate reads it and learns nothing they did not read in the
 * option.
 *
 * The detail was there — the same guideline gives a single 200 mg dose
 * of mifepristone followed by misoprostol at a dose that falls as
 * gestation advances — three chunks away from the one the question
 * cited. So this widens the view: every cited chunk brings its
 * neighbours from the same document, and the explanation is rewritten
 * from that fuller passage set with instructions to carry the dose, the
 * interval, the threshold, whatever operative detail the source gives.
 *
 * The citations grow to match what the new text actually rests on, so
 * the question stays traceable. Stem, options and answer are untouched,
 * and the result faces the same grounding check and lints as a new
 * question. The review queue only, unless --include-approved.
 *
 *   npx tsx scripts/enrich-explanations.mts --dry
 *   npx tsx scripts/enrich-explanations.mts --id 66
 *   npx tsx scripts/enrich-explanations.mts
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
const { getChunksByIds } = await import("../src/lib/retrieval");
const {
  checkGrounding,
  extractJson,
  formatPassages,
  ukEnglishProblems,
  sourceNarrationProblems,
} = await import("../src/lib/generation");
const { PROMPT_G, PROMPT_E } = await import("../src/lib/prompts");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY = (() => {
  const i = args.indexOf("--id");
  return i >= 0 ? Number(args[i + 1]) : null;
})();
const INCLUDE_APPROVED = args.includes("--include-approved");
// Enriching a row twice invites a second, different rewrite of prose
// that was already good, so the queue that has had its pass can be
// excluded rather than re-read.
const APPROVED_ONLY = args.includes("--approved-only");
const NEIGHBOURS = 3; // chunks either side, within the same document

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

let query = db
  .from("generated_questions")
  .select("*")
  .in(
    "status",
    APPROVED_ONLY
      ? ["approved"]
      : INCLUDE_APPROVED
        ? ["approved", "pending"]
        : ["pending"]
  )
  .order("id");
if (ONLY !== null) query = query.eq("id", ONLY);
const { data } = await query;
const rows = (data ?? []) as Record<string, any>[];

console.log(`${rows.length} question(s)${DRY ? " — DRY RUN" : ""}\n`);

let improved = 0;
let unchanged = 0;

for (const q of rows) {
  const options = (q.options ?? []) as { key: string; text: string }[];
  const explanations = (q.explanations ?? []) as {
    key: string;
    verdict: string;
    text: string;
    citation_chunk_ids: number[];
    source_reference?: string;
  }[];
  const correct = explanations.find((e) => e.key === q.correct_key);
  if (!correct || correct.citation_chunk_ids.length === 0) {
    unchanged++;
    continue;
  }

  // The cited passages, plus their neighbours in the same document —
  // a recommendation and the regimen that implements it are usually
  // adjacent, and retrieval routinely brings back only the first.
  const cited = await getChunksByIds(correct.citation_chunk_ids);
  if (cited.length === 0) {
    unchanged++;
    continue;
  }
  const wanted = new Set<number>(correct.citation_chunk_ids);
  for (const c of cited) {
    const { data: near } = await db
      .from("content_chunks")
      .select("id")
      .eq("document_id", c.document_id)
      .gte("chunk_index", c.chunk_index - NEIGHBOURS)
      .lte("chunk_index", c.chunk_index + NEIGHBOURS);
    for (const n of near ?? []) wanted.add(n.id as number);
  }
  const passages = await getChunksByIds([...wanted]);

  const user = [
    `QUESTION:\n${q.stem}`,
    `OPTIONS:\n${options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${q.correct_key}. ${options.find((o) => o.key === q.correct_key)?.text ?? ""}`,
    `CURRENT EXPLANATION:\n${correct.text}`,
    `SOURCE PASSAGES:\n${formatPassages(passages)}`,
  ].join("\n\n");

  let text = "";
  let cites: number[] = [];
  let problems: string[] = ["not attempted"];

  for (let attempt = 0; attempt < 3 && problems.length > 0; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 900,
      system: PROMPT_G + "\n\n" + PROMPT_E,
      messages: [
        {
          role: "user",
          content:
            attempt === 0
              ? user
              : `${user}\n\nYour previous attempt was rejected for: ${problems.join("; ")}. Try again.`,
        },
      ],
    });
    const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    try {
      const parsed = JSON.parse(extractJson(raw)) as {
        explanation?: unknown;
        citation_chunk_ids?: unknown;
        unchanged?: unknown;
      };
      if (parsed.unchanged === true) {
        problems = [];
        text = "";
        break;
      }
      text = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
      cites = Array.isArray(parsed.citation_chunk_ids)
        ? (parsed.citation_chunk_ids as unknown[]).map(Number).filter(Number.isFinite)
        : [];
    } catch {
      problems = ["response was not JSON"];
      continue;
    }

    problems = [];
    if (!text) problems.push("empty explanation");
    problems.push(...ukEnglishProblems(text));
    problems.push(...sourceNarrationProblems(text));
    if (/\[chunk:\s*\d+\]/i.test(text)) problems.push("citation markers in the prose");
    const known = new Set(passages.map((p) => p.chunk_id));
    const bad = cites.filter((id) => !known.has(id));
    if (bad.length > 0) problems.push(`cites passages not provided: ${bad.join(", ")}`);
    if (cites.length === 0) problems.push("cites nothing");
  }

  if (!text) {
    unchanged++;
    continue;
  }
  if (problems.length > 0) {
    console.log(`  ${q.id}: LEFT — ${problems.join("; ")}`);
    unchanged++;
    continue;
  }

  // Still answerable, still by the same option, on the new citations.
  const candidate = {
    ...q,
    options,
    explanations: [{ ...correct, verdict: "correct", text, citation_chunk_ids: cites }],
  };
  const usedPassages = passages.filter((p) => cites.includes(p.chunk_id));
  const grounding = await checkGrounding(candidate as any, usedPassages as any, client, model);
  if (!grounding.ok) {
    console.log(`  ${q.id}: LEFT — enriched version fails grounding: ${grounding.reason}`);
    unchanged++;
    continue;
  }

  console.log(`\n  ${q.id} (${q.format}/${q.status})  cites ${correct.citation_chunk_ids.join(",")} -> ${cites.join(",")}`);
  console.log(`    was: ${correct.text}`);
  console.log(`    now: ${text}`);

  if (!DRY) {
    const { error } = await db
      .from("generated_questions")
      .update({
        explanation: "",
        explanations: [{ ...correct, verdict: "correct", text, citation_chunk_ids: cites }],
        citation_chunk_ids: cites,
      })
      .eq("id", q.id);
    if (error) {
      console.log(`    WRITE FAILED — ${error.message}`);
      unchanged++;
      continue;
    }
  }
  improved++;
}

console.log(`\n${DRY ? "would enrich" : "enriched"} ${improved}, left ${unchanged}`);
