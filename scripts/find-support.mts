/**
 * For each "unsupported" finding of audit-facts, look for the passage
 * that does say it.
 *
 *   npx tsx scripts/find-support.mts
 *   npx tsx scripts/find-support.mts --ids 86,614
 *
 * Most unsupported claims in the bank are true and were read from a
 * passage the question did not cite: Q86's 193 twin sets and 18.1% sit
 * two chunks along in the guideline it does cite. Removing those would
 * take correct teaching out of the bank; citing them is the repair. So
 * before a claim is cut, the guideline it came from is searched, then
 * the library, and the reviewer is asked whether any candidate states
 * it, with the words that do.
 *
 * Candidates: the cited documents' own chunks ranked by the claim's
 * figures and words, and the library's nearest chunks by embedding. The
 * quote the reviewer gives is matched against the chunk, and an
 * unmatched quote counts as no support. Reads the bank, writes
 * .review/support/ only.
 */
import fs from "node:fs";
import path from "node:path";

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
const { retrieveChunks } = await import("../src/lib/retrieval");

/* Whether a passage states a claim is a narrower judgement than the
   audit's, and Sonnet 4.5 (which the live app does not use) makes it
   well; the Opus quota is kept for the audit and the repairs. */
const modelAt = process.argv.indexOf("--model");
const REVIEWER =
  modelAt >= 0 ? process.argv[modelAt + 1] : "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
const IN = ".review/facts";
const OUT = ".review/support";
const CONCURRENCY = 4;
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const idsAt = args.indexOf("--ids");
const ONLY =
  idsAt >= 0 ? new Set(args[idsAt + 1].split(",").map((s) => Number(s.trim()))) : null;

type Finding = {
  kind: string;
  where: string;
  quote: string;
  problem: string;
  correction?: string;
  verified: boolean;
};
/*
  An unsupported claim is searched for as written. A finding that the
  answer is wrong, that a second option is right, or that practice has
  moved on is searched for by its CORRECTION: a repair that changes an
  answer needs the passage that says the new one, not the reviewer's
  memory of it.
*/
const BY_CORRECTION = new Set(["wrong_answer", "second_answer", "clinical_concern"]);
const claimOf = (f: Finding) =>
  BY_CORRECTION.has(f.kind) ? `${f.correction ?? ""} ${f.problem}`.trim() : f.quote;
type Saved = { key: string; ids: number[]; passages: number[]; findings: Finding[] };

const db = createAdminClient();
const client = claudeClient({ maxRetries: 10, timeout: 300_000 });

const files = fs.readdirSync(IN).filter((f) => f.endsWith(".json"));
const jobs: { saved: Saved; index: number; finding: Finding }[] = [];
for (const f of files) {
  const saved = JSON.parse(fs.readFileSync(path.join(IN, f), "utf8")) as Saved;
  if (ONLY && !saved.ids.some((id) => ONLY.has(id))) continue;
  saved.findings.forEach((finding, index) => {
    if (finding.verified && (finding.kind === "unsupported" || BY_CORRECTION.has(finding.kind)))
      jobs.push({ saved, index, finding });
  });
}
const pending = jobs.filter(
  (j) => !fs.existsSync(path.join(OUT, `${j.saved.key}-${j.index}.json`))
);
console.error(`${jobs.length} unsupported finding(s); ${pending.length} still to search`);

/* The cited documents' chunks, fetched per document and kept. */
const docOfChunk = new Map<number, number>();
const docChunks = new Map<number, { id: number; text: string }[]>();
const docMeta = new Map<number, string>();
async function chunksOfDoc(docId: number) {
  if (!docChunks.has(docId)) {
    const { data, error } = await db
      .from("content_chunks")
      .select("id, text")
      .eq("document_id", docId)
      .order("chunk_index")
      .limit(1000);
    if (error) throw new Error(error.message);
    docChunks.set(docId, data ?? []);
  }
  return docChunks.get(docId)!;
}
async function docOf(chunkIds: number[]) {
  const missing = chunkIds.filter((c) => !docOfChunk.has(c));
  if (missing.length) {
    const { data, error } = await db.from("content_chunks").select("id, document_id").in("id", missing);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) docOfChunk.set(c.id, c.document_id);
  }
  return Array.from(new Set(chunkIds.map((c) => docOfChunk.get(c)).filter((d): d is number => !!d)));
}
async function label(docIds: number[]) {
  const missing = docIds.filter((d) => !docMeta.has(d));
  if (missing.length) {
    const { data, error } = await db
      .from("content_documents")
      .select("id, title, source_reference, source_year")
      .in("id", missing);
    if (error) throw new Error(error.message);
    for (const d of data ?? [])
      docMeta.set(d.id, `${d.title} (${d.source_reference}${d.source_year ? `, ${d.source_year}` : ""})`);
  }
}

const STOP = new Set(
  "with that this from have been which their there were they than also into when where what should would could about after before other these those such more most less only over under between within without does each both very".split(
    " "
  )
);
function terms(s: string) {
  const lower = s.toLowerCase();
  const nums = lower.match(/\d+(?:\.\d+)?/g) ?? [];
  const words = (lower.match(/[a-z][a-z-]{3,}/g) ?? []).filter((w) => !STOP.has(w));
  return { nums, words };
}
function score(text: string, t: ReturnType<typeof terms>) {
  const lower = text.toLowerCase();
  let s = 0;
  for (const n of t.nums) if (new RegExp(`(^|[^0-9.])${n.replace(".", "\\.")}([^0-9]|$)`).test(lower)) s += 3;
  for (const w of new Set(t.words)) if (lower.includes(w)) s += 1;
  return s;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
function found(quote: string | undefined, text: string): boolean {
  if (!quote) return false;
  const q = norm(quote);
  const t = norm(text);
  if (t.includes(q)) return true;
  for (const piece of q.split(/\s*(?:\.\.\.|…)\s*/)) if (piece.length >= 20 && t.includes(piece)) return true;
  return false;
}
function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const SYSTEM = `You check whether a source passage states a claim made in an exam explanation.

You are given one claim and several candidate passages, each with a chunk id and its document. Decide whether any passage STATES the claim: the same figure with the same meaning, the same recommendation, the same fact. A passage that is merely about the same topic does not. A passage that gives a different figure, a different population, or a weaker statement does not, and in that case say what it does say.

Some claims are a reviewer's correction rather than the explanation's own words ("the answer should be D, because NICE recommends..."). For those, decide whether a passage states what the correction relies on, and if a passage instead supports the question as it stands, say so in "differs".

Prefer a passage from the document the question already cites; then a UK guideline (RCOG, NICE, BASHH, FSRH); then other sources. If more than one passage is needed to carry the whole claim, give each.

Reply with JSON only:
{"supported": true|false, "support": [{"chunk_id": 123, "quote": "<the passage's own words that state it, copied exactly>"}], "differs": "<if a passage states something different from the claim, what it says, with its chunk id; else empty>", "note": "<one sentence>"}`;

let done = 0;
async function search(job: (typeof pending)[number]) {
  const claim = claimOf(job.finding);
  const cited = job.saved.passages;
  const docs = await docOf(cited);
  const t = terms(claim);
  const local: { id: number; text: string; doc: number }[] = [];
  for (const d of docs) for (const c of await chunksOfDoc(d)) local.push({ ...c, doc: d });
  const ranked = local
    .filter((c) => !cited.includes(c.id))
    .map((c) => ({ c, s: score(c.text, t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((x) => x.c);
  const wide = await retrieveChunks(claim, null, 6);
  const candidates = new Map<number, { text: string; doc: number }>();
  for (const c of ranked) candidates.set(c.id, { text: c.text, doc: c.doc });
  for (const c of wide) if (!cited.includes(c.chunk_id)) candidates.set(c.chunk_id, { text: c.text, doc: c.document_id });
  await label(Array.from(new Set(Array.from(candidates.values()).map((c) => c.doc))));

  const user = `CLAIM (from the explanation of question ${job.saved.ids.join(", ")}): ${claim}\n\nWHY IT WAS FLAGGED: ${job.finding.problem}\n\nDOCUMENT(S) THE QUESTION CITES: ${docs
    .map((d) => docMeta.get(d) ?? `document ${d}`)
    .join("; ")}\n\n=== CANDIDATE PASSAGES ===\n\n${Array.from(candidates.entries())
    .map(([id, c]) => `[chunk ${id}] ${docMeta.get(c.doc) ?? `document ${c.doc}`}\n${c.text}`)
    .join("\n\n")}`;
  const reply = await client.messages.create({
    model: REVIEWER,
    max_tokens: 6000,
    thinking: { type: "enabled", budget_tokens: 3000 },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = firstJsonObject(text);
  if (!json) throw new Error(`no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as {
    supported: boolean;
    support?: { chunk_id: number | string; quote: string }[];
    differs?: string;
    note?: string;
  };
  const support = (parsed.support ?? []).map((s) => {
    const id = Number(String(s.chunk_id).replace(/\D/g, ""));
    const c = candidates.get(id);
    return {
      chunk_id: id,
      quote: s.quote,
      document: c ? docMeta.get(c.doc) ?? `document ${c.doc}` : "?",
      sameDocument: c ? docs.includes(c.doc) : false,
      verified: !!c && found(s.quote, c.text),
    };
  });
  fs.writeFileSync(
    path.join(OUT, `${job.saved.key}-${job.index}.json`),
    JSON.stringify(
      {
        key: job.saved.key,
        ids: job.saved.ids,
        index: job.index,
        where: job.finding.where,
        claim,
        supported: parsed.supported && support.length > 0 && support.every((s) => s.verified),
        support,
        differs: parsed.differs ?? "",
        note: parsed.note ?? "",
      },
      null,
      1
    )
  );
}

const queue = pending.slice();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await search(job);
      } catch (e) {
        const message = (e as Error).message;
        console.error(`  ${job.saved.key}-${job.index}: ${message.slice(0, 200)}`);
        if (/per day/i.test(message)) {
          console.error("  daily token quota reached: stopping");
          queue.length = 0;
        }
      }
      if (++done % 25 === 0) console.error(`  ${done}/${pending.length}`);
    }
  })
);

let supported = 0;
let same = 0;
for (const j of jobs) {
  const p = path.join(OUT, `${j.saved.key}-${j.index}.json`);
  if (!fs.existsSync(p)) continue;
  const r = JSON.parse(fs.readFileSync(p, "utf8"));
  if (r.supported) {
    supported += 1;
    if (r.support.every((s: { sameDocument: boolean }) => s.sameDocument)) same += 1;
  }
}
console.log(`${jobs.length} unsupported claim(s): ${supported} found in a passage (${same} in the guideline already cited)`);
