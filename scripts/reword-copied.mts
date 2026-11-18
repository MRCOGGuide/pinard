/**
 * Put copied explanations into Pinard's own words (L7.2; owner, 18
 * November 2026: runs of 20 words or more before launch, 15 to 19 after).
 *
 *   npx tsx --conditions=react-server scripts/reword-copied.mts --min 20 [--limit N] [--model ID]
 *       proposes: reads .review/overlap-approved.json (scripts/audit-overlap.mts),
 *       writes .review/reword-copied/proposals.json, resuming where it stopped
 *   npx tsx --conditions=react-server scripts/reword-copied.mts --apply --proposals .review/reword-copied/proposals.json
 *       applies the proposals marked "ok" after they have been read
 *
 * Only an explanation's wording changes: the stem, options, answer and
 * citations stay as they are, and each proposal is checked before it is
 * offered: no run of ten or more words from a cited passage, the same
 * figures, the same negations, about the same length, UK English and no
 * narration of the source. A proposal is applied only if the stored
 * explanation is still the one it was written from.
 *
 * Opus by default (the Revise skill: never Sonnet 4.6, the live app's
 * model, for bulk work), falling back to Opus 4.5 then Sonnet 4.5 when a
 * daily quota stops it.
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
const { claudeClient } = await import("../src/lib/anthropic");
const { extractJson, formatPassages, ukEnglishProblems, sourceNarrationProblems } = await import("../src/lib/generation");
const { PROMPT_G, PROMPT_W } = await import("../src/lib/prompts");
const overlap = await import("../src/lib/sourceOverlap");

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes("--apply");
const MIN = Number(arg("--min") ?? 20);
const LIMIT = Number(arg("--limit") ?? Infinity);
const DIR = ".review/reword-copied";
const PROPOSALS = arg("--proposals") ?? `${DIR}/proposals.json`;
const MODELS = arg("--model")
  ? [arg("--model")!]
  : ["global.anthropic.claude-opus-4-6-v1", "global.anthropic.claude-opus-4-5-20251101-v1:0", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"];

type Explanation = { key: string; verdict: string; text: string; citation_chunk_ids?: number[]; source_reference?: string };
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanation: string | null;
  explanations: Explanation[];
  citation_chunk_ids: number[] | null;
};
type Proposal = {
  id: number;
  /** The explanation's option key, or "card" for the combined paragraph. */
  key: string;
  before: string;
  after: string;
  runBefore: number;
  runAfter: number;
  status: "ok" | "failed";
  problems: string[];
  model: string;
};

const db = createAdminClient();
fs.mkdirSync(DIR, { recursive: true });
const proposals: Proposal[] = fs.existsSync(PROPOSALS) ? JSON.parse(fs.readFileSync(PROPOSALS, "utf8")) : [];
const save = () => fs.writeFileSync(PROPOSALS, JSON.stringify(proposals, null, 2));

const NUMBERS = (t: string) => (t.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
const NEGATIONS = (t: string) => (t.toLowerCase().match(/\b(not|no|never|avoid\w*|without|cannot|unless)\b/g) ?? []).length;
const wordsIn = (t: string) => t.split(/\s+/).filter(Boolean).length;
/** How hedged it is: a re-wording may not make a statement more certain. */
const HEDGES = (t: string) =>
  (t.toLowerCase().match(/\b(may|might|could|can|possibly|probably|usually|often|generally|typically|rarely|consider\w*|suggest\w*|uncertain|unclear|limited)\b/g) ?? []).length;

async function load(id: number): Promise<Row | null> {
  const { data } = await db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, options, correct_key, explanation, explanations, citation_chunk_ids")
    .eq("id", id)
    .single();
  return (data as unknown as Row) ?? null;
}

/** The cited passages with their document's name; read directly, so it does not depend on the phase 59 column. */
async function passagesFor(ids: number[]) {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("content_chunks")
    .select("id, document_id, section_id, chunk_index, text, content_documents(title, source_reference, source_year)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as {
    id: number;
    document_id: number;
    section_id: number;
    chunk_index: number;
    text: string;
    content_documents: { title: string | null; source_reference: string | null; source_year: number | null } | null;
  }[]).map((c) => ({
    chunk_id: c.id,
    document_id: c.document_id,
    section_id: c.section_id,
    chunk_index: c.chunk_index,
    text: c.text,
    similarity: 1,
    document_title: c.content_documents?.title ?? "",
    source_reference: c.content_documents?.source_reference ?? "",
    source_year: c.content_documents?.source_year ?? null,
  }));
}

function textOf(row: Row, key: string): string {
  if (key === "card") return row.explanation ?? "";
  return row.explanations.find((e) => e.key === key)?.text ?? "";
}

if (APPLY) {
  let applied = 0;
  let skipped = 0;
  for (const p of proposals.filter((x) => x.status === "ok")) {
    const row = await load(p.id);
    if (!row || row.status !== "approved" || textOf(row, p.key) !== p.before) {
      console.log(`  #${p.id} ${p.key}: SKIP, the stored explanation has changed since the proposal`);
      skipped++;
      continue;
    }
    const update =
      p.key === "card"
        ? { explanation: p.after }
        : { explanations: row.explanations.map((e) => (e.key === p.key ? { ...e, text: p.after } : e)) };
    const { error } = await db.from("generated_questions").update(update).eq("id", p.id).eq("status", "approved");
    if (error) {
      console.log(`  #${p.id} ${p.key}: WRITE FAILED, ${error.message}`);
      skipped++;
      continue;
    }
    applied++;
  }
  console.log(`applied ${applied}, skipped ${skipped}`);
  process.exit(0);
}

const findings = (JSON.parse(fs.readFileSync(".review/overlap-approved.json", "utf8")) as { id: number; part: string; words: number }[])
  .filter((f) => f.words >= MIN && /^explanation\b/.test(f.part));
const todo = [...new Map(findings.map((f) => [`${f.id}|${f.part}`, f])).values()]
  .map((f) => ({ id: f.id, key: f.part === "explanation" ? "card" : f.part.replace(/^explanation /, "") }))
  .filter((t) => !proposals.some((p) => p.id === t.id && p.key === t.key && p.status === "ok"))
  .slice(0, LIMIT);
console.log(`${findings.length} explanations with a run of ${MIN}+ words; ${todo.length} to propose`);

let modelAt = 0;
let inTokens = 0;
let outTokens = 0;
for (const t of todo) {
  const row = await load(t.id);
  if (!row || row.status !== "approved") continue;
  const before = textOf(row, t.key);
  const entry = row.explanations.find((e) => e.key === t.key);
  const ids = [...new Set([...(row.citation_chunk_ids ?? []), ...(entry?.citation_chunk_ids ?? [])])];
  const chunks = await passagesFor(ids);
  const index = overlap.overlapIndex(chunks.map((c) => ({ chunk_id: c.chunk_id, text: c.text })));
  const runBefore = overlap.longestCopiedRun(before, index)?.words ?? 0;
  const shared: string[] = [];
  {
    // Every run of 10+ words it shares, so the rewrite can see all of them.
    let rest = before;
    for (let i = 0; i < 6; i++) {
      const run = overlap.longestCopiedRun(rest, index);
      if (!run) break;
      shared.push(run.text);
      const words = overlap.plainWords(rest);
      const at = words.join(" ").indexOf(run.text);
      rest = at >= 0 ? words.join(" ").slice(0, at) + " | " + words.join(" ").slice(at + run.text.length) : "";
    }
  }
  const user = [
    `QUESTION:\n${[row.lead_in, row.stem].filter(Boolean).join("\n")}`,
    `OPTIONS:\n${row.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `CORRECT OPTION: ${row.correct_key}`,
    `EXPLANATION AS IT STANDS (${wordsIn(before)} words):\n${before}`,
    `RUNS SHARED WORD FOR WORD WITH THE PASSAGES (re-say these):\n${shared.map((s) => `- "${s}"`).join("\n")}`,
    `SOURCE PASSAGES:\n${formatPassages(chunks)}`,
  ].join("\n\n");

  let after = "";
  let problems: string[] = ["not attempted"];
  let used = MODELS[modelAt];
  for (let attempt = 0; attempt < 3 && problems.length > 0; attempt++) {
    used = MODELS[modelAt];
    let raw = "";
    try {
      const res = await claudeClient().messages.create({
        model: used,
        max_tokens: 800,
        system: PROMPT_G + "\n\n" + PROMPT_W,
        messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: ${problems.join("; ")}. Re-word it again.` }],
      });
      inTokens += res.usage.input_tokens;
      outTokens += res.usage.output_tokens;
      raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message) && modelAt < MODELS.length - 1) {
        modelAt++;
        console.log(`  quota on ${used}; moving to ${MODELS[modelAt]}`);
        attempt--;
        continue;
      }
      problems = [`model call failed: ${message.slice(0, 120)}`];
      break;
    }
    try {
      const parsed = JSON.parse(extractJson(raw)) as { explanation?: unknown };
      after = typeof parsed.explanation === "string" ? parsed.explanation.trim() : "";
    } catch {
      problems = ["the response was not JSON"];
      continue;
    }
    const run = overlap.longestCopiedRun(after, index);
    const ratio = wordsIn(after) / Math.max(1, wordsIn(before));
    problems = [
      ...(after ? [] : ["empty explanation"]),
      ...(run ? [`still ${run.words} words in a row from a passage ("${run.text}")`] : []),
      ...(NUMBERS(after) !== NUMBERS(before) ? [`the figures changed (before: ${NUMBERS(before) || "none"}; after: ${NUMBERS(after) || "none"})`] : []),
      ...(NEGATIONS(after) !== NEGATIONS(before) ? ["a negation (not, no, never, avoid, without, unless) was added or lost"] : []),
      ...(HEDGES(after) < HEDGES(before) ? ["a qualifier (may, can, usually, consider...) was lost, which makes a statement more certain than the guidance"] : []),
      ...(ratio < 0.85 || ratio > 1.12 ? [`the length changed from ${wordsIn(before)} to ${wordsIn(after)} words; keep it within a tenth`] : []),
      ...(/\[chunk:\s*\d+\]/i.test(after) ? ["citation markers in the prose"] : []),
      ...ukEnglishProblems(after),
      ...sourceNarrationProblems(after),
    ];
  }

  const runAfter = after ? overlap.longestCopiedRun(after, index)?.words ?? 0 : runBefore;
  const proposal: Proposal = { id: t.id, key: t.key, before, after, runBefore, runAfter, status: problems.length ? "failed" : "ok", problems, model: used };
  const at = proposals.findIndex((p) => p.id === t.id && p.key === t.key);
  if (at >= 0) proposals[at] = proposal;
  else proposals.push(proposal);
  save();
  console.log(`  #${t.id} ${t.key}: ${proposal.status}${problems.length ? ` (${problems[0]})` : ""}, run ${runBefore} -> ${runAfter}`);
}

const ok = proposals.filter((p) => p.status === "ok").length;
console.log(`\n${ok} proposals ready, ${proposals.length - ok} failed; ${inTokens} input + ${outTokens} output tokens. Read ${PROPOSALS} before --apply.`);
