/**
 * Two contradiction checks, both drawn from question 1156.
 *
 * 1156 put a woman through the NHS contingent NIPT pathway and had it
 * return a sex chromosome result, while its own explanation closed
 * with "NIPT should not be offered for sex chromosome aneuploidy".
 * The stem did the thing the explanation forbade.
 *
 * It also sat awkwardly beside question 1011, which gives a different
 * figure for the same quantity. Two questions in one bank disagreeing
 * about a number is the kind of thing a candidate notices and a
 * reputation does not survive.
 *
 *   npx tsx scripts/audit-contradictions.mts
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
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: Option[] | null;
  correct_key: string | null;
  explanations: { key: string; text: string }[] | null;
  source_document_ids: number[] | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, options, correct_key, explanations, source_document_ids")
    .neq("status", "rejected")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

const STOP = new Set(
  ("the a an and or of for to in on at is are was were be been with without her his their this that these those " +
    "she he they it not no which what who whom whose from by as if then than most single best appropriate next " +
    "step management woman women patient years old year gestation weeks presents attends referred seen clinic " +
    "following after before during about asks reports history examination shows reveals confirms result results " +
    "would should could may can will has have had does do did more less other another each any all both").split(
    /\s+/
  )
);

function content(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9%+.\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    )
  );
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / (sa.size + sb.size - inter || 1);
}

function correctText(q: Row): string {
  return (q.options ?? []).find((o) => o.key === q.correct_key)?.text ?? "";
}

function prose(q: Row): string {
  return (q.explanations ?? []).map((e) => e.text ?? "").join("\n");
}

// ---------------------------------------------------------------
// 1. An explanation that forbids what its own stem describes.
// ---------------------------------------------------------------
const PROHIBITION =
  /\b(?:should not be|must not be|is not|are not|cannot be|should never be)\s+(?:routinely\s+)?(offered|used|performed|given|recommended|indicated|undertaken|interpreted|available)\b([^.;]{0,90})/gi;

console.log(`checked ${all.length} questions (rejected excluded)\n`);
console.log("EXPLANATION FORBIDS WHAT THE STEM DESCRIBES");

type Hit = { id: number; status: string; overlap: number; phrase: string; shared: string[] };
const hits: Hit[] = [];
for (const q of all) {
  const stemWords = new Set(content(q.stem));
  let m: RegExpExecArray | null;
  const re = new RegExp(PROHIBITION.source, "gi");
  while ((m = re.exec(prose(q)))) {
    const object = content(m[2]);
    if (object.length < 2) continue;
    const shared = object.filter((w) => stemWords.has(w));
    const overlap = shared.length / object.length;
    if (overlap >= 0.6 && shared.length >= 2)
      hits.push({
        id: q.id,
        status: q.status,
        overlap,
        phrase: (m[0] as string).trim().replace(/\s+/g, " "),
        shared,
      });
  }
}
hits.sort((a, b) => b.overlap - a.overlap);
if (!hits.length) console.log("   none");
for (const h of hits.slice(0, 25))
  console.log(`   #${h.id} (${h.status})  "${h.phrase}"\n        stem also contains: ${h.shared.join(", ")}`);

// ---------------------------------------------------------------
// 2. Near-duplicate questions whose answers disagree.
// ---------------------------------------------------------------
console.log("\nNEAR-DUPLICATE QUESTIONS WITH DIFFERENT ANSWERS");
const words = new Map<number, string[]>();
for (const q of all) words.set(q.id, content(q.stem + " " + (q.lead_in ?? "")));

// Index by content word so we only compare questions that share vocabulary.
const index = new Map<string, number[]>();
for (const q of all) {
  for (const w of words.get(q.id) ?? []) {
    if (!index.has(w)) index.set(w, []);
    index.get(w)!.push(q.id);
  }
}
const byId = new Map(all.map((q) => [q.id, q]));
const seen = new Set<string>();
const pairs: { a: Row; b: Row; sim: number }[] = [];
for (const q of all) {
  const candidates = new Set<number>();
  for (const w of words.get(q.id) ?? []) {
    const bucket = index.get(w) ?? [];
    if (bucket.length > 60) continue; // a word this common tells us nothing
    for (const id of bucket) if (id !== q.id) candidates.add(id);
  }
  for (const id of candidates) {
    const key = q.id < id ? `${q.id}:${id}` : `${id}:${q.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const other = byId.get(id)!;
    const sim = jaccard(words.get(q.id)!, words.get(id)!);
    if (sim < 0.50) continue;
    pairs.push({ a: q, b: other, sim });
  }
}
pairs.sort((x, y) => y.sim - x.sim);
if (!pairs.length) console.log("   none");
for (const p of pairs.slice(0, 60)) {
  const same = correctText(p.a).toLowerCase().trim() === correctText(p.b).toLowerCase().trim();
  console.log(`   #${p.a.id} (${p.a.status}) vs #${p.b.id} (${p.b.status})  similarity ${p.sim.toFixed(2)}${same ? "  SAME ANSWER" : ""}`);
  console.log(`        ${p.a.stem.slice(0, 100).replace(/\s+/g, " ")}`);
  console.log(`          answer: ${correctText(p.a)}`);
  console.log(`        ${p.b.stem.slice(0, 100).replace(/\s+/g, " ")}`);
  console.log(`          answer: ${correctText(p.b)}`);
}
