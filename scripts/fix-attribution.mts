/**
 * Repair questions that credit a study instead of the guidance, or
 * point at where inside a document a fact sits.
 *
 * "According to the AHRQ meta-analysis data, which of the following..."
 * asks a candidate about provenance rather than medicine, and the
 * explanation that followed it opened "In the AHRQ meta-analysis, the
 * figures marked with an asterisk in Appendix V of the RCOG Green-top
 * Guideline...", which is a filing reference. Once guidance adopts a
 * figure, that figure is simply what you quote the woman in front of
 * you.
 *
 * The clinical scenario, the options and the answer are untouched —
 * only the attribution and the explanation change — and the repaired
 * question is then put back through the same grounding check and the
 * same lints a freshly generated one faces. Anything that fails is
 * left alone and reported, never half-written.
 *
 *   npx tsx scripts/fix-attribution.mts --dry
 *   npx tsx scripts/fix-attribution.mts
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
  listRecallProblems,
} = await import("../src/lib/generation");
const { PROMPT_G, PROMPT_S } = await import("../src/lib/prompts");

const DRY = process.argv.includes("--dry");
const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const { data } = await db
  .from("generated_questions")
  .select("*")
  .in("status", ["approved", "pending"])
  .order("id");
const rows = (data ?? []) as Record<string, any>[];

/** The same judgement the lint now makes, applied to what is already stored. */
function offends(q: Record<string, any>): boolean {
  const explanations = (q.explanations ?? []) as { text: string }[];
  const text = [q.stem ?? "", q.lead_in ?? "", ...explanations.map((e) => e.text ?? "")].join(
    "\n"
  );
  return sourceNarrationProblems(text).length > 0;
}

const todo = rows.filter(offends);
console.log(
  `${rows.length} approved/pending; ${todo.length} credit a study or point at a location${DRY ? " — DRY RUN" : ""}\n`
);

let fixed = 0;
let left = 0;

for (const q of todo) {
  const options = (q.options ?? []) as { key: string; text: string }[];
  const explanations = (q.explanations ?? []) as {
    key: string;
    verdict: string;
    text: string;
    citation_chunk_ids: number[];
    source_reference?: string;
  }[];
  const correct = explanations.find((e) => e.key === q.correct_key);
  if (!correct) {
    console.log(`  ${q.id}: LEFT — no explanation for the correct option`);
    left++;
    continue;
  }

  const passages = await getChunksByIds(correct.citation_chunk_ids);
  if (passages.length === 0) {
    console.log(`  ${q.id}: LEFT — cited passages no longer exist`);
    left++;
    continue;
  }

  const user = [
    `STEM:\n${q.stem}`,
    `OPTIONS:\n${options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${q.correct_key}`,
    `CURRENT EXPLANATION:\n${correct.text}`,
    `SOURCE PASSAGES:\n${formatPassages(passages)}`,
  ].join("\n\n");

  let stem = "";
  let text = "";
  let problems: string[] = ["not attempted"];

  for (let attempt = 0; attempt < 3 && problems.length > 0; attempt++) {
    const res = await client.messages.create({
      model,
      max_tokens: 1200,
      system: PROMPT_G + "\n\n" + PROMPT_S,
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
        stem?: unknown;
        explanation?: unknown;
        error?: unknown;
      };
      if (parsed.error === "insufficient_source_material") {
        problems = ["model reported insufficient_source_material"];
        break;
      }
      stem = typeof parsed.stem === "string" ? parsed.stem.trim() : "";
      text = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    } catch {
      problems = ["response was not JSON"];
      continue;
    }

    problems = [];
    if (!stem) problems.push("empty stem");
    if (!text) problems.push("empty explanation");
    const both = `${stem}\n${text}`;
    problems.push(...ukEnglishProblems(both));
    problems.push(...sourceNarrationProblems(both));
    problems.push(...listRecallProblems(stem));
    if (/\[chunk:\s*\d+\]/i.test(both)) problems.push("citation markers in the prose");
  }

  if (problems.length > 0) {
    console.log(`  ${q.id}: LEFT — ${problems.join("; ")}`);
    left++;
    continue;
  }

  // The scenario must still be answerable, and by the same option.
  const candidate = {
    ...q,
    stem,
    options,
    correct_key: q.correct_key,
    explanations: [{ ...correct, verdict: "correct", text }],
  };
  const grounding = await checkGrounding(candidate as any, passages as any, client, model);
  if (!grounding.ok) {
    console.log(`  ${q.id}: LEFT — repaired version fails grounding: ${grounding.reason}`);
    left++;
    continue;
  }

  console.log(`\n  ${q.id} (${q.format}/${q.status})`);
  console.log(`    stem was: ${String(q.stem).slice(0, 150)}`);
  console.log(`    stem now: ${stem.slice(0, 150)}`);
  console.log(`    expl now: ${text.slice(0, 170)}`);

  if (!DRY) {
    const { error } = await db
      .from("generated_questions")
      .update({
        stem,
        explanation: "",
        explanations: [{ ...correct, verdict: "correct", text }],
      })
      .eq("id", q.id);
    if (error) {
      console.log(`    WRITE FAILED — ${error.message}`);
      left++;
      continue;
    }
  }
  fixed++;
}

console.log(`\n${DRY ? "would repair" : "repaired"} ${fixed}, left alone ${left}`);
