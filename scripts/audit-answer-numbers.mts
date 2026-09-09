/**
 * Model-free grounding check for numeric answers.
 *
 * The grounding check proper is a model call, and the API is on hold.
 * But a numeric answer can be checked without one: if the correct
 * option says 91%, the figure 91 has to appear somewhere in the
 * passages the question cites. A number that is not in its own source
 * is either invented or copied off the wrong quantity, and both mark
 * a candidate wrong for being right.
 *
 * Reports the evidence either way, since the interesting cases are
 * the near misses — a figure that appears as 0.13 where the option
 * says 13%, say.
 *
 *   npx tsx scripts/audit-answer-numbers.mts
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
const db = createAdminClient();

type Option = { key: string; text: string };
type Explanation = { key: string; text: string; citation_chunk_ids?: number[] };
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  options: Option[] | null;
  correct_key: string | null;
  explanations: Explanation[] | null;
  citation_chunk_ids: number[] | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, format, stem, options, correct_key, explanations, citation_chunk_ids")
    .neq("status", "rejected")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

// Every chunk the bank cites, fetched once.
const needed = new Set<number>();
for (const q of all) {
  for (const c of q.citation_chunk_ids ?? []) needed.add(c);
  for (const e of q.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) needed.add(c);
}
const ids = Array.from(needed);
const text = new Map<number, string>();
for (let i = 0; i < ids.length; i += 500) {
  const { data, error } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", ids.slice(i, i + 500));
  if (error) throw error;
  for (const c of (data ?? []) as { id: number; text: string }[]) text.set(c.id, c.text);
}

/**
 * Figures worth checking. Bare small integers are skipped — "2" or
 * "grade 3" is in every passage by accident, so a hit would prove
 * nothing and a miss would be noise.
 */
function salientNumbers(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) out.push(m[1]);
  for (const m of s.matchAll(/\b1\s+in\s+(\d[\d,]*)/gi)) out.push(m[1].replace(/,/g, ""));
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(?:mg|micrograms?|mcg|g|iu|units?|ml|mmol|micromol|weeks?|days?|hours?|minutes?|months?|years?|cm|mm)\b/gi))
    out.push(m[1]);
  return Array.from(new Set(out)).filter((n) => Number(n) >= 10 || n.includes("."));
}

/** Is this figure in the passage text, allowing 1,000 and 1000? */
function present(n: string, haystack: string): boolean {
  const flat = haystack.replace(/,/g, "");
  const re = new RegExp("(?<![\\d.])" + n.replace(".", "\\.") + "(?![\\d])");
  return re.test(flat);
}

/** The nearest figure in the passages, to show how near a miss it was. */
function nearest(n: string, haystack: string): string | null {
  const target = Number(n);
  let best: { v: number; raw: string } | null = null;
  for (const m of haystack.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)) {
    const v = Number(m[0]);
    if (!best || Math.abs(v - target) < Math.abs(best.v - target)) best = { v, raw: m[0] };
  }
  return best ? best.raw : null;
}

type Finding = { id: number; status: string; detail: string };
const missing: Finding[] = [];
const uncited: Finding[] = [];

for (const q of all) {
  const opts = q.options ?? [];
  const keyed = opts.find((o) => o.key === q.correct_key);
  if (!keyed) continue;
  const numbers = salientNumbers(keyed.text);
  if (!numbers.length) continue;

  const cites = new Set<number>([
    ...(q.citation_chunk_ids ?? []),
    ...(q.explanations ?? []).flatMap((e) => e.citation_chunk_ids ?? []),
  ]);
  const passages = Array.from(cites)
    .map((c) => text.get(c) ?? "")
    .join("\n");
  if (!passages.trim()) {
    uncited.push({ id: q.id, status: q.status, detail: `answer "${keyed.text}" — no passage text found` });
    continue;
  }

  const absent = numbers.filter((n) => !present(n, passages));
  if (absent.length) {
    const near = absent.map((n) => `${n} (nearest in source: ${nearest(n, passages) ?? "none"})`);
    missing.push({
      id: q.id,
      status: q.status,
      detail: `answer "${keyed.text}" — not in cited passages: ${near.join("; ")}`,
    });
  }
}

console.log(`checked ${all.length} questions (rejected excluded)\n`);
if (uncited.length) {
  console.log(`NO PASSAGE TEXT — ${uncited.length}`);
  for (const f of uncited.slice(0, 20)) console.log(`   #${f.id} (${f.status})  ${f.detail}`);
  console.log();
}
console.log(`ANSWER FIGURE NOT IN ITS OWN SOURCE — ${missing.length}`);
for (const f of missing) console.log(`   #${f.id} (${f.status})  ${f.detail}`);
if (!missing.length) console.log("   none");
