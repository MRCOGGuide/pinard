/**
 * NICE passages restated as Pinard's own fact statements (L7.4; the
 * owner's D9, 18 November 2026: "Figure a way to keep citation and
 * knowledge so it doesn't affect functionality - if you do - then
 * deletion is OK"; "Yes, that method").
 *
 * Three steps, each run on purpose:
 *
 *   npx tsx --conditions=react-server scripts/nice-to-facts.mts [--limit N] [--model ID]
 *       PROPOSE: each NICE passage restated, checked, written to
 *       .review/nice-facts/proposals.json (kept out of git); resumes.
 *   npx tsx --conditions=react-server scripts/nice-to-facts.mts --replace --proposals .review/nice-facts/proposals.json
 *       REPLACE (owner's yes): each passage's text becomes its restatement,
 *       re-indexed for search, keeping the same passage id, so every
 *       question's citation and Ask Pinard's search keep working.
 *   npx tsx --conditions=react-server scripts/nice-to-facts.mts --delete-files
 *       DELETE (owner's yes on the counts): the stored NICE files, once
 *       every passage of a document has been replaced.
 *
 * A restatement is checked before it is offered: no run of ten or more
 * words from the passage, every figure and recommendation number kept,
 * the same "do not", "offer", "consider" and "may" wording, and about the
 * same length. Prints totals and ids only.
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
const { claudeClient } = await import("../src/lib/anthropic");
const { extractJson, ukEnglishProblems } = await import("../src/lib/generation");
const { PROMPT_N, NICE_RESTATED } = await import("../src/lib/prompts");
const overlap = await import("../src/lib/sourceOverlap");

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const REPLACE = args.includes("--replace");
const DELETE_FILES = args.includes("--delete-files");
const LIMIT = Number(arg("--limit") ?? Infinity);
const DIR = ".review/nice-facts";
const PROPOSALS = arg("--proposals") ?? `${DIR}/proposals.json`;
const MODELS = arg("--model")
  ? [arg("--model")!]
  : ["global.anthropic.claude-opus-4-6-v1", "global.anthropic.claude-opus-4-5-20251101-v1:0", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"];

type Proposal = {
  chunk_id: number;
  document_id: number;
  before: string;
  after: string;
  status: "ok" | "failed" | "no_content";
  problems: string[];
  model: string;
};

const db = createAdminClient();
fs.mkdirSync(DIR, { recursive: true });
const proposals: Proposal[] = fs.existsSync(PROPOSALS) ? JSON.parse(fs.readFileSync(PROPOSALS, "utf8")) : [];
const save = () => fs.writeFileSync(PROPOSALS, JSON.stringify(proposals, null, 2));

// The NICE documents: those whose reference or title names NICE.
const docs = (
  await fetchAll<{ id: number; title: string | null; source_reference: string | null; file_url: string | null }>((f, t) =>
    db.from("content_documents").select("id, title, source_reference, file_url").order("id").range(f, t)
  )
).filter((d) => /\bNICE\b/i.test(`${d.source_reference ?? ""} ${d.title ?? ""}`));
const docIds = docs.map((d) => d.id);
const chunks = await fetchAll<{ id: number; document_id: number; chunk_index: number; text: string }>((f, t) =>
  db.from("content_chunks").select("id, document_id, chunk_index, text").in("document_id", docIds).order("id").range(f, t)
);
console.log(`NICE documents: ${docs.length}; passages: ${chunks.length}; already restated: ${chunks.filter((c) => c.text.startsWith(NICE_RESTATED)).length}`);

const NUMBERS = (t: string) => t.match(/\d+(?:\.\d+)*/g) ?? [];
const STRENGTH = (t: string) => {
  const s = t.toLowerCase();
  return {
    doNot: (s.match(/\b(do not|don't|should not|must not|never)\b/g) ?? []).length,
    offer: (s.match(/\boffer\w*\b/g) ?? []).length,
    consider: (s.match(/\bconsider\w*\b/g) ?? []).length,
  };
};
const wordsIn = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** The PDF's running footer and header, which carry page numbers and the guideline's own code, not content. */
function withoutPageFurniture(text: string): string {
  return text
    .replace(/©\s*NICE\s*\d{4}\.?[\s\S]*?Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/\((?:NG|CG|QS|PH)\d+\)/g, " ");
}
/** Another guideline named by its title is a name, and may be repeated. */
const TITLES = /\b(?:the\s+)?NICE\s+(?:guideline|quality standard|technology appraisal guidance)\s+on\s+[^.;:[\]()]+/gi;

function problemsWith(rawBefore: string, after: string): string[] {
  const before = withoutPageFurniture(rawBefore);
  const index = overlap.overlapIndex([{ chunk_id: 0, text: before.replace(TITLES, " | ") }]);
  const run = overlap.longestCopiedRun(after.replace(TITLES, " | "), index);
  const missing = [...new Set(NUMBERS(before))].filter((n) => !NUMBERS(after).includes(n));
  const b = STRENGTH(before);
  const a = STRENGTH(after);
  const ratio = wordsIn(after) / Math.max(1, wordsIn(before));
  return [
    ...(run ? [`${run.words} words in a row are still the passage's own ("${run.text}")`] : []),
    ...(missing.length ? [`figures or recommendation numbers left out: ${missing.slice(0, 12).join(", ")}`] : []),
    ...(a.doNot < b.doNot ? ["a \"do not\" was lost"] : []),
    ...(a.offer < b.offer ? ["an \"offer\" was lost or weakened"] : []),
    ...(a.consider !== b.consider && a.consider < b.consider ? ["a \"consider\" was lost or firmed up"] : []),
    ...(ratio < 0.5 ? [`it is much shorter than the passage (${wordsIn(after)} words against ${wordsIn(before)}): something was left out`] : []),
    ...(ratio > 1.4 ? [`it is much longer than the passage (${wordsIn(after)} words against ${wordsIn(before)})`] : []),
    ...ukEnglishProblems(after),
  ];
}

if (REPLACE) {
  const { embedTexts } = await import("../src/lib/voyage");
  const { countTokens } = await import("../src/lib/chunking");
  const ready = proposals.filter((p) => p.status === "ok" || p.status === "no_content");
  let replaced = 0;
  let skipped = 0;
  for (let i = 0; i < ready.length; i += 20) {
    const batch = ready.slice(i, i + 20).filter((p) => {
      const now = chunks.find((c) => c.id === p.chunk_id);
      const same = now && now.text === p.before;
      if (!same) skipped++;
      return same;
    });
    if (batch.length === 0) continue;
    const texts = batch.map((p) => `${NICE_RESTATED}\n${p.status === "no_content" ? "(no clinical content)" : p.after}`);
    const embeddings = await embedTexts(texts, "document");
    for (let j = 0; j < batch.length; j++) {
      const { error } = await db
        .from("content_chunks")
        .update({ text: texts[j], embedding: embeddings[j], token_count: countTokens(texts[j]) })
        .eq("id", batch[j].chunk_id);
      if (error) {
        console.log(`  passage ${batch[j].chunk_id}: WRITE FAILED, ${error.message}`);
        skipped++;
      } else replaced++;
    }
  }
  console.log(`replaced ${replaced} passages; skipped ${skipped} (changed since the proposal, or failed)`);
  process.exit(0);
}

if (DELETE_FILES) {
  const done = new Set(chunks.filter((c) => c.text.startsWith(NICE_RESTATED)).map((c) => c.document_id));
  const whole = docs.filter((d) => chunks.filter((c) => c.document_id === d.id).every((c) => c.text.startsWith(NICE_RESTATED)) && done.has(d.id));
  const files = whole.map((d) => d.file_url).filter((f): f is string => Boolean(f));
  console.log(`documents fully restated: ${whole.length} of ${docs.length}; stored files to delete: ${files.length}`);
  if (files.length === 0) process.exit(0);
  const { error } = await db.storage.from("sources").remove(files);
  if (error) {
    console.log(`delete failed: ${error.message}`);
    process.exit(1);
  }
  for (const d of whole) await db.from("content_documents").update({ file_url: null }).eq("id", d.id);
  console.log(`deleted ${files.length} stored NICE files; their documents keep their title, reference, link and restated passages`);
  process.exit(0);
}

// PROPOSE
const todo = chunks
  .filter((c) => !c.text.startsWith(NICE_RESTATED))
  .filter((c) => !proposals.some((p) => p.chunk_id === c.id && p.status !== "failed" && p.before === c.text))
  .slice(0, LIMIT);
console.log(`${todo.length} to propose`);

let modelAt = 0;
let inTokens = 0;
let outTokens = 0;
for (const c of todo) {
  const doc = docs.find((d) => d.id === c.document_id);
  const user = `SOURCE: ${doc?.source_reference ?? ""}${doc?.title ? `, ${doc.title}` : ""}\n\nPASSAGE:\n${c.text}`;
  let after = "";
  let status: Proposal["status"] = "failed";
  let problems: string[] = ["not attempted"];
  let used = MODELS[modelAt];
  for (let attempt = 0; attempt < 3 && problems.length > 0; attempt++) {
    used = MODELS[modelAt];
    let raw = "";
    try {
      const res = await claudeClient().messages.create({
        model: used,
        max_tokens: 3000,
        system: PROMPT_N,
        messages: [{ role: "user", content: attempt === 0 ? user : `${user}\n\nYOUR PREVIOUS RESTATEMENT WAS REJECTED: ${problems.join("; ")}. Restate it again, keeping everything.` }],
      });
      inTokens += res.usage.input_tokens;
      outTokens += res.usage.output_tokens;
      raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
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
      after = String((JSON.parse(extractJson(raw)) as { statements?: unknown }).statements ?? "").trim();
    } catch {
      problems = ["the response was not JSON"];
      continue;
    }
    if (after === "(no clinical content)") {
      status = "no_content";
      problems = [];
      break;
    }
    problems = after ? problemsWith(c.text, after) : ["empty restatement"];
    if (problems.length === 0) status = "ok";
  }
  const proposal: Proposal = { chunk_id: c.id, document_id: c.document_id, before: c.text, after, status, problems, model: used };
  const at = proposals.findIndex((p) => p.chunk_id === c.id);
  if (at >= 0) proposals[at] = proposal;
  else proposals.push(proposal);
  save();
  console.log(`  passage ${c.id}: ${status}${problems.length ? ` (${problems[0].slice(0, 100)})` : ""}`);
}

const count = (s: Proposal["status"]) => proposals.filter((p) => p.status === s).length;
console.log(`\nproposals: ${count("ok")} ready, ${count("no_content")} with no clinical content, ${count("failed")} failed; ${inTokens} input + ${outTokens} output tokens`);
