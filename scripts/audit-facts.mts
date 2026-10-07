/**
 * Every claim in every question, read against the passages it cites.
 *
 *   npx tsx scripts/audit-facts.mts                 the approved bank
 *   npx tsx scripts/audit-facts.mts --limit 30      the first 30 units
 *   npx tsx scripts/audit-facts.mts --ids 408,1130  these questions (an id in a set brings the set)
 *   npx tsx scripts/audit-facts.mts --report        print what is saved, call nothing
 *
 * The narrow audits each look for one fault the bank has already shown:
 * a figure, a contradiction, a vignette that cannot have happened. This
 * one reads the whole question the way a reviewer does, the stem, every
 * option, the marked answer and its explanation, against the passages
 * cited for it, and reports anything wrong, anything the passages do not
 * say, and anything a passage says differently.
 *
 * The reviewer is a different and stronger model than the generator, so
 * it is not marking its own work. It must quote: every finding carries
 * the question's words verbatim, and a contradiction carries the
 * passage's words too. Both are matched against the text they claim to
 * come from, and a finding whose quote is not there is dropped rather
 * than believed.
 *
 * Unit by unit into .review/facts/, so a run that stops resumes where it
 * stopped. Reads the bank, writes nothing to it: every finding is read
 * by a person before anything is repaired.
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
const { fetchAll } = await import("../src/lib/supabase/all");
const { claudeClient } = await import("../src/lib/anthropic");

/*
  Opus 4.6 by default, Opus 4.5 with --model when 4.6's daily Bedrock
  quota is spent. Never the generator's Sonnet 4.6: the live app draws on
  that quota, and a reviewer should not be the model it is reviewing.
*/
const modelAt = process.argv.indexOf("--model");
const REVIEWER = modelAt >= 0 ? process.argv[modelAt + 1] : "global.anthropic.claude-opus-4-6-v1";
/* Bedrock counts output tokens five times against the daily quota, and
   thinking is output: 6000 spent 4.6's day in 170 units. */
const THINKING = 3000;
const outAt = process.argv.indexOf("--out");
const OUT = outAt >= 0 ? process.argv[outAt + 1] : ".review/facts";
const CONCURRENCY = 6;

const args = process.argv.slice(2);
const REPORT = args.includes("--report");
const limitAt = args.indexOf("--limit");
const LIMIT = limitAt >= 0 ? Number(args[limitAt + 1]) : Infinity;
const idsAt = args.indexOf("--ids");
const ONLY =
  idsAt >= 0 ? new Set(args[idsAt + 1].split(",").map((s) => Number(s.trim()))) : null;
const FORCE = args.includes("--force");

type Option = { key: string; text: string };
type Explanation = { key: string; text: string; citation_chunk_ids?: number[] };
type Row = {
  id: number;
  format: string;
  stem: string;
  lead_in: string | null;
  options: Option[];
  correct_key: string;
  explanation: string | null;
  explanations: Explanation[] | null;
  explanation_table: { headers?: string[]; rows?: string[][] } | null;
  citation_chunk_ids: number[] | null;
  emq_group_id: string | null;
};
export type Finding = {
  kind: string;
  where: string;
  quote: string;
  passage_quote?: string;
  chunk_id?: number;
  problem: string;
  correction?: string;
  verified: boolean;
};

fs.mkdirSync(OUT, { recursive: true });
const db = createAdminClient();

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select(
      "id, format, stem, lead_in, options, correct_key, explanation, explanations, explanation_table, citation_chunk_ids, emq_group_id"
    )
    .eq("status", "approved")
    .order("id")
    .range(from, to)
);

/* A unit is what a candidate sees at once: one SBA, or one whole EMQ set. */
const units = new Map<string, Row[]>();
for (const r of rows) {
  const key = r.format === "emq" && r.emq_group_id ? `set-${r.emq_group_id}` : `q-${r.id}`;
  if (!units.has(key)) units.set(key, []);
  units.get(key)!.push(r);
}
let work = Array.from(units.entries());
if (ONLY) work = work.filter(([, rs]) => rs.some((r) => ONLY.has(r.id)));
work = work.slice(0, LIMIT);

const fileOf = (key: string) => path.join(OUT, `${key}.json`);

if (REPORT) {
  report();
  process.exit(0);
}

/* Every cited passage and its document, fetched once. */
const citedOf = (r: Row) => {
  const s = new Set<number>(r.citation_chunk_ids ?? []);
  for (const e of r.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) s.add(c);
  return s;
};
const allCited = new Set<number>();
for (const [, rs] of work) for (const r of rs) for (const c of citedOf(r)) allCited.add(c);
const chunk = new Map<number, { text: string; document_id: number }>();
const ids = Array.from(allCited);
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db
    .from("content_chunks")
    .select("id, text, document_id")
    .in("id", ids.slice(i, i + 200));
  if (error) throw new Error(error.message);
  for (const c of data ?? []) chunk.set(c.id, c);
}
const docIds = Array.from(new Set(Array.from(chunk.values()).map((c) => c.document_id)));
const doc = new Map<number, { title: string; source_reference: string; source_year: number | null }>();
for (let i = 0; i < docIds.length; i += 200) {
  const { data, error } = await db
    .from("content_documents")
    .select("id, title, source_reference, source_year")
    .in("id", docIds.slice(i, i + 200));
  if (error) throw new Error(error.message);
  for (const d of data ?? []) doc.set(d.id, d);
}

const SYSTEM = `You are a senior UK obstetrician and gynaecologist and an MRCOG Part 2 examiner. You are auditing questions in a revision bank that has already been published to candidates. Every error you miss is taught to a trainee as fact. Every finding you invent wastes a clinician's time. Be exact.

You are given one unit: a single best answer question, or an extended matching set (one option list shared by several scenarios). With it you are given the source passages the question cites, each labelled with its chunk id and document.

Read the stem, every option, the marked answer and every explanation, and report:

wrong_answer: the marked answer is not the correct answer according to the passages, or according to current UK practice if the passages are silent.
second_answer: another option is also correct, or equally defensible as the best answer, so a well-prepared candidate could reasonably choose it.
contradicts_source: something the question or explanation states disagrees with a cited passage. Give the passage's own words.
misquoted: a figure, threshold, dose, interval, drug or term differs from the passage it came from, or a sign, unit or decimal is wrong. Give the passage's own words.
unsupported: a factual statement (a figure, a recommendation, a mechanism, a rate, a named fact) that none of the cited passages states. This includes figures the explanation worked out itself (converting a percentage into "1 in N", a hazard ratio into "84% higher") and reasoning presented as fact that the passages do not give. Do NOT report the vignette's own invented clinical details, the restating of a passage in other words, or arithmetic on the vignette's own numbers.
incoherent: the vignette contradicts itself or its marked answer: a step already done, impossible at the stage described, a risk factor counted that she no longer has, details that do not fit together, or a stem that asks a different question from the one the answer answers.
clinical_concern: from your own knowledge, something is wrong, unsafe or out of date for current UK practice (RCOG, NICE, BASHH, FSRH, UKMEC) even though the passages may say it. Say what current guidance says and name the guidance.
flawed_item: the answer can be found without the knowledge being tested (the stem gives it away, only one option is plausible, the right answer is the only one of its kind), or the stem is ambiguous about what is asked.

Do not report spelling, style, length or formatting. Do not report a passage's own wording as an error. Do not report something you are unsure of: if you would write "arguably", "may", or "could be seen as", leave it out. Most questions have no findings, and an empty list is the expected answer for a sound one.

For every finding:
- "where": "stem", "lead_in", "option B", "explanation", "table", or for a set "scenario <question id> stem" / "scenario <question id> explanation" / "option B".
- "quote": the exact words from the question that are wrong, copied character for character, at least five words where the text allows.
- "passage_quote" and "chunk_id": for contradicts_source and misquoted, the passage's words copied exactly, and its chunk id.
- "problem": one or two sentences saying what is wrong.
- "correction": what it should say instead, drawn from the passages where they cover it.

Reply with JSON only, in exactly this shape:
{"findings":[{"kind":"misquoted","where":"explanation","quote":"...","passage_quote":"...","chunk_id":1234,"problem":"...","correction":"..."}]}`;

function render(rs: Row[]): string {
  const parts: string[] = [];
  const first = rs[0];
  if (first.format === "emq") {
    parts.push(`EXTENDED MATCHING SET (question ids ${rs.map((r) => r.id).join(", ")})`);
    if (first.lead_in) parts.push(`LEAD-IN: ${first.lead_in}`);
    parts.push(`OPTIONS:\n${first.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`);
    for (const r of rs) {
      parts.push(`--- scenario ${r.id} ---\nSTEM: ${r.stem}\nMARKED ANSWER: ${r.correct_key}`);
      for (const e of r.explanations ?? []) parts.push(`EXPLANATION (${e.key}): ${e.text}`);
      if (r.explanation) parts.push(`EXPLANATION: ${r.explanation}`);
    }
  } else {
    parts.push(`SINGLE BEST ANSWER (question id ${first.id})`);
    parts.push(`STEM: ${first.stem}`);
    if (first.lead_in) parts.push(`LEAD-IN: ${first.lead_in}`);
    parts.push(`OPTIONS:\n${first.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`);
    parts.push(`MARKED ANSWER: ${first.correct_key}`);
    if (first.explanation) parts.push(`EXPLANATION: ${first.explanation}`);
    for (const e of first.explanations ?? []) parts.push(`EXPLANATION (${e.key}): ${e.text}`);
  }
  for (const r of rs) {
    const t = r.explanation_table;
    if (t?.rows?.length) {
      parts.push(
        `TABLE${rs.length > 1 ? ` (scenario ${r.id})` : ""}:\n${[t.headers ?? [], ...t.rows]
          .map((row) => row.join(" | "))
          .join("\n")}`
      );
    }
  }
  return parts.join("\n\n");
}

function passagesOf(rs: Row[]): { id: number; text: string; label: string }[] {
  const seen = new Set<number>();
  const out: { id: number; text: string; label: string }[] = [];
  for (const r of rs)
    for (const c of citedOf(r)) {
      if (seen.has(c)) continue;
      seen.add(c);
      const ch = chunk.get(c);
      if (!ch) continue;
      const d = doc.get(ch.document_id);
      out.push({
        id: c,
        text: ch.text,
        label: d ? `${d.title} (${d.source_reference}${d.source_year ? `, ${d.source_year}` : ""})` : `document ${ch.document_id}`,
      });
    }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
/* A quote is found when its words appear in order; a model shortens a
   quote at its ends more often than it alters it in the middle, so the
   longest stretch of it that matches counts, if it is long enough to mean
   something. */
function found(quote: string | undefined, text: string): boolean {
  if (!quote) return false;
  const q = norm(quote).replace(/\.\.\.|…/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(text);
  if (q.length < 8) return t.includes(q) && q.length > 0;
  if (t.includes(q)) return true;
  for (const piece of q.split(/ (?:\.\.\.|…) | \[.*?\] /)) if (piece.length >= 25 && t.includes(piece)) return true;
  const minLen = Math.min(40, Math.floor(q.length * 0.6));
  for (let len = q.length - 1; len >= minLen; len -= 4)
    for (let i = 0; i + len <= q.length; i += 4) if (t.includes(q.slice(i, i + len))) return true;
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

const client = claudeClient({ maxRetries: 10, timeout: 300_000 });
let done = 0;
let failed = 0;
let inTok = 0;
let outTok = 0;

async function audit(key: string, rs: Row[]) {
  if (!FORCE && fs.existsSync(fileOf(key))) return;
  const passages = passagesOf(rs);
  const question = render(rs);
  const user = `${question}\n\n=== CITED PASSAGES ===\n\n${passages
    .map((p) => `[chunk ${p.id}] ${p.label}\n${p.text}`)
    .join("\n\n")}`;
  const reply = await client.messages.create({
    model: REVIEWER,
    max_tokens: THINKING + 5000,
    thinking: { type: "enabled", budget_tokens: THINKING },
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  inTok += reply.usage.input_tokens;
  outTok += reply.usage.output_tokens;
  const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = firstJsonObject(text);
  if (!json) throw new Error(`no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as { findings?: Omit<Finding, "verified">[] };
  const passageText = passages.map((p) => p.text).join("\n");
  const findings: Finding[] = (parsed.findings ?? []).map((raw) => {
    // It names the field "type" as often as "kind".
    const f = { ...raw, kind: raw.kind ?? (raw as { type?: string }).type ?? "unknown" };
    const quoteOk = found(f.quote, question);
    const passageOk =
      !["contradicts_source", "misquoted"].includes(f.kind) || found(f.passage_quote, passageText);
    return { ...f, verified: quoteOk && passageOk };
  });
  fs.writeFileSync(
    fileOf(key),
    JSON.stringify({ key, ids: rs.map((r) => r.id), passages: passages.map((p) => p.id), findings }, null, 1)
  );
}

const queue = work.slice();
const started = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      try {
        await audit(next[0], next[1]);
      } catch (e) {
        failed += 1;
        const message = (e as Error).message;
        console.error(`  ${next[0]}: ${message.slice(0, 200)}`);
        /* A daily quota will not lift by retrying: stop, and resume
           tomorrow or on another model. */
        if (/per day/i.test(message)) {
          console.error("  daily token quota reached: stopping");
          queue.length = 0;
        }
      }
      done += 1;
      if (done % 25 === 0) {
        const mins = ((Date.now() - started) / 60000).toFixed(1);
        console.error(
          `  ${done}/${work.length} in ${mins} min; tokens in ${inTok} out ${outTok}; ~$${((inTok * 5 + outTok * 25) / 1e6).toFixed(2)}`
        );
      }
    }
  })
);
console.error(
  `read ${done}, failed ${failed}; tokens in ${inTok} out ${outTok}; ~$${((inTok * 5 + outTok * 25) / 1e6).toFixed(2)}`
);
report();

function report() {
  const tally: Record<string, number> = {};
  let units = 0;
  let flagged = 0;
  let dropped = 0;
  for (const [key] of work) {
    if (!fs.existsSync(fileOf(key))) continue;
    units += 1;
    const saved = JSON.parse(fs.readFileSync(fileOf(key), "utf8")) as { findings: Finding[] };
    const kept = saved.findings.filter((f) => f.verified);
    dropped += saved.findings.length - kept.length;
    if (kept.length) flagged += 1;
    for (const f of kept) tally[f.kind] = (tally[f.kind] ?? 0) + 1;
  }
  console.log(`\n${units} unit(s) read; ${flagged} with findings; ${dropped} finding(s) dropped for an unverifiable quote`);
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
}
