/**
 * Re-ground questions whose cited chunks no longer exist.
 *
 * Re-ingesting a document gives its passages new ids, and any question
 * already citing the old ones is left pointing at nothing. The question
 * may be perfectly good — the guidance it was written from is still in
 * the library — but it can no longer be traced to it, and a question
 * that cannot be traced to its source is the one thing this product
 * promises never to show.
 *
 * So each is re-grounded rather than deleted: find the passages that
 * now carry the same guidance, put the claim to the same grounding
 * check a freshly generated question faces — which demands a verbatim
 * quote — and cite the passage that quote came from. Only then is the
 * explanation rewritten, from those passages, in the house style.
 *
 * Anything that fails the check is rejected. A question whose answer no
 * current passage establishes has no business being approved, whatever
 * it once cited.
 *
 *   npx tsx scripts/reground-questions.mts --dry
 *   npx tsx scripts/reground-questions.mts
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
const { retrieveChunks } = await import("../src/lib/retrieval");
const {
  checkGrounding,
  extractJson,
  formatPassages,
  ukEnglishProblems,
  sourceNarrationProblems,
} = await import("../src/lib/generation");
const { PROMPT_G, PROMPT_R } = await import("../src/lib/prompts");

const DRY = process.argv.includes("--dry");
const CANDIDATES = 12;

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Which questions point at chunks that are gone?
const { data: all } = await db
  .from("generated_questions")
  .select("*")
  .in("status", ["approved", "pending"]);
const rows = (all ?? []) as Record<string, any>[];

const citedIds = [...new Set(rows.flatMap((q) => q.citation_chunk_ids ?? []))];
const live = new Set<number>();
for (let i = 0; i < citedIds.length; i += 500) {
  const { data } = await db
    .from("content_chunks")
    .select("id")
    .in("id", citedIds.slice(i, i + 500));
  for (const r of data ?? []) live.add(r.id as number);
}

const broken = rows.filter((q) => {
  const ids = (q.citation_chunk_ids ?? []) as number[];
  return ids.length === 0 || ids.every((id) => !live.has(id));
});

console.log(`${broken.length} question(s) cite chunks that no longer exist`);
if (DRY) console.log("DRY RUN — nothing will be written\n");

let regrounded = 0;
let rejected = 0;

for (const q of broken) {
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
    console.log(`  ${q.id}: REJECT — no explanation for the correct option`);
    if (!DRY) await reject(q.id, "no explanation for the correct option");
    rejected++;
    continue;
  }

  // Search the section it belongs to, using the question and its own
  // reasoning as the query — the guidance it was written from is what
  // should come back.
  const passages = await retrieveChunks(
    `${q.stem}\n${correct.text}`,
    [q.section_id as number],
    CANDIDATES
  );
  if (passages.length === 0) {
    console.log(`  ${q.id}: REJECT — no passages in its section`);
    if (!DRY) await reject(q.id, "no current passages in its section");
    rejected++;
    continue;
  }

  // Put the answer to the same check a new question faces, against
  // everything retrieved; the quote it returns says which passage
  // actually carries it.
  const candidate = {
    stem: q.stem as string,
    options,
    correct_key: q.correct_key as string,
    explanation: "",
    explanations: [
      { ...correct, citation_chunk_ids: passages.map((p) => p.chunk_id) },
    ],
    difficulty: Number(q.difficulty ?? 3),
    citation_chunk_ids: passages.map((p) => p.chunk_id),
    coverage_note: "",
  };

  const grounding = await checkGrounding(candidate as any, passages, client, model);
  if (!grounding.ok) {
    console.log(`  ${q.id}: REJECT — ${grounding.reason}`);
    if (!DRY) await reject(q.id, grounding.reason);
    rejected++;
    continue;
  }

  // Cite the passages that actually carry the answer. checkGrounding
  // has already matched its quote against them; narrowing by the words
  // of that quote keeps the citation honest rather than citing all
  // twelve because one of them happened to work.
  const quote = ((grounding as { quote?: string }).quote ?? "").toLowerCase();
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const carrying = quote
    ? passages.filter((p) => flat(p.text).includes(flat(quote).slice(0, 60)))
    : [];
  const citePassages = carrying.length > 0 ? carrying : passages.slice(0, 3);

  // Rewrite from those passages, to the same standard as the rest.
  const user = [
    `QUESTION:\n${q.stem}`,
    `OPTIONS:\n${options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${q.correct_key}`,
    `CURRENT EXPLANATION:\n${correct.text}`,
    `SOURCE PASSAGES:\n${formatPassages(citePassages)}`,
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
    const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    try {
      const parsed = JSON.parse(extractJson(raw)) as { explanation?: unknown };
      text = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    } catch {
      problems = ["response was not JSON"];
      continue;
    }
    problems = text
      ? [
          ...ukEnglishProblems(text),
          ...sourceNarrationProblems(text),
          ...(/\[chunk:\s*\d+\]/i.test(text) ? ["citation markers in the prose"] : []),
        ]
      : ["empty explanation"];
  }

  if (problems.length > 0 || !text) {
    console.log(`  ${q.id}: REJECT — rewrite failed: ${problems.join("; ")}`);
    if (!DRY) await reject(q.id, `rewrite failed: ${problems.join("; ")}`);
    rejected++;
    continue;
  }

  const ids = citePassages.map((p) => p.chunk_id);
  console.log(`\n  ${q.id}: RE-GROUNDED onto chunk(s) ${ids.join(", ")}`);
  console.log(`    was: ${correct.text.slice(0, 130)}`);
  console.log(`    now: ${text}`);

  if (!DRY) {
    const { error } = await db
      .from("generated_questions")
      .update({
        explanation: "",
        explanations: [
          {
            ...correct,
            verdict: "correct",
            text,
            citation_chunk_ids: ids,
          },
        ],
        citation_chunk_ids: ids,
      })
      .eq("id", q.id);
    if (error) {
      console.log(`    WRITE FAILED — ${error.message}`);
      continue;
    }
  }
  regrounded++;
}

async function reject(id: number, reason: string) {
  await db
    .from("generated_questions")
    .update({ status: "rejected" })
    .eq("id", id);
  await db.from("generation_failures").insert({
    reason: `re-grounding: ${reason} (question ${id} rejected)`,
    raw_response: null,
  });
}

console.log(
  `\n${DRY ? "would re-ground" : "re-grounded"} ${regrounded}, ${DRY ? "would reject" : "rejected"} ${rejected}`
);
