/**
 * A stem whose gestation breaks a limit the question's own
 * explanation states.
 *
 * Question 1202 had a pelvic lymph node dissection performed at 24
 * weeks when its source says nodal resection is not recommended after
 * the 22nd week. The obvious check — read the limit out of the source
 * document — was tried and abandoned: extracted PDF text runs tables
 * and headings into sentences, so it produced 43 flags that were all
 * heading fragments or limits on other interventions, and it still
 * missed 1202 itself, because the source says "nodal resection" where
 * the stem said "lymph node dissection".
 *
 * This is the version that works. Explanations are written prose, not
 * extracted PDF, and an explanation and its stem share one author and
 * one vocabulary. It cannot see a limit that no explanation states —
 * 1202 before repair is exactly that case — so it is a floor, not a
 * guarantee.
 *
 *   npx tsx scripts/audit-gestation.mts
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

type Row = {
  id: number;
  status: string;
  stem: string;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, stem, explanations, explanation")
    .neq("status", "rejected")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

/** Gestations the stem states, in weeks. */
function stemWeeks(stem: string): number[] {
  const out: number[] = [];
  const re = /\b(\d{1,2})(?:\s*\+\s*\d)?\s*weeks?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stem))) {
    const n = Number(m[1]);
    if (n >= 4 && n <= 42) out.push(n);
  }
  return out;
}

const THRESHOLD =
  /\b(after|beyond|before|prior to)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:completed\s+)?weeks?\b/gi;
const PROHIBITION =
  /\b(not recommended|not advised|contraindicated|should not|must not|cannot be|is not performed|should be avoided|not be offered|not be given|is unsafe|no longer)\b/i;

type Finding = { id: number; status: string; weeks: number[]; sentence: string };
const findings: Finding[] = [];

for (const q of all) {
  const weeks = stemWeeks(q.stem);
  if (!weeks.length) continue;
  const prose = [...(q.explanations ?? []).map((e) => e.text ?? ""), q.explanation ?? ""]
    .filter(Boolean)
    .join(" ");
  if (!prose) continue;

  const re = new RegExp(THRESHOLD.source, "gi");
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(prose))) {
    const limitN = Number(m[2]);
    const dir = m[1].toLowerCase();
    const isAfter = dir === "after" || dir === "beyond";
    const broken = isAfter ? weeks.some((w) => w > limitN) : weeks.some((w) => w < limitN);
    if (!broken) continue;

    const start = Math.max(0, prose.lastIndexOf(".", m.index - 1) + 1);
    const dot = prose.indexOf(".", m.index + m[0].length);
    const sentence = prose.slice(start, dot === -1 ? prose.length : dot + 1).trim();
    if (!PROHIBITION.test(sentence)) continue;
    if (seen.has(sentence)) continue;
    seen.add(sentence);
    findings.push({ id: q.id, status: q.status, weeks, sentence: sentence.replace(/\s+/g, " ") });
  }
}

console.log(`checked ${all.length} questions\n`);
console.log(`STEM GESTATION AGAINST A LIMIT ITS OWN EXPLANATION STATES — ${findings.length}`);
for (const f of findings) {
  console.log(`\n   #${f.id} (${f.status})  stem gives ${f.weeks.join("/")} weeks`);
  console.log(`        explanation: "${f.sentence.slice(0, 200)}"`);
}
if (!findings.length) console.log("   none");
