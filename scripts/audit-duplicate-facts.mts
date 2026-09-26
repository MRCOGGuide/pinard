/**
 * A stem that gives the same fact twice, with two different values.
 *
 *   npx tsx scripts/audit-duplicate-facts.mts
 *
 * #1602 said "A 32-year-old woman …" and then "She is 44 years old —
 * wait, she is 32 years old". The self-talk lint catches that one by
 * its "wait". Take the "wait" away and nothing was watching: a
 * vignette that simply states two ages reads as ordinary prose, and
 * the candidate has to guess which the question means.
 *
 * Ages, BMIs and parity only. Gestation is deliberately left out:
 * "corticosteroids between 24+0 and 34+6" and "scans at 28, 32 and 36
 * weeks" are a plan, not a contradiction, and a check that flags every
 * plan in the bank is a check nobody runs twice.
 *
 * Numbers alone, no model. A second age often belongs to somebody else
 * — a partner, a previous pregnancy, a woman's age at menarche — so
 * every hit is read by a person.
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

const db = createAdminClient();

type Row = { id: number; status: string; format: string; stem: string | null };

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

/**
 * "a 32-year-old woman", "she is 44 years old", "aged 38 years".
 *
 * "is 26" on its own is not an age. It is 26 weeks, a BMI of 26, a
 * cervical length, a WCC — the first draft of this matched it and
 * called 96 sound stems contradictory, every one of them a woman with
 * an age and a gestation.
 */
const AGE =
  /\b(\d{2})[- ]year[- ]old\b|\b(?:is|was|aged)\s+(\d{2})\s+years\s+old\b/gi;
const BMI = /\bBMI\s*(?:of\s*|is\s*)?(\d{2}(?:\.\d)?)\b/gi;
const PARITY = /\b(?:para|P)\s?(\d)\b/gi;

function values(text: string, re: RegExp): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(re)) {
    const v = Number(m.slice(1).find((g) => g !== undefined));
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

let faults = 0;
for (const r of rows) {
  const stem = r.stem ?? "";
  for (const [what, re, floor] of [
    ["age", AGE, 15],
    ["BMI", BMI, 15],
    ["parity", PARITY, 0],
  ] as const) {
    const found = values(stem, re).filter((v) => v >= floor);
    const distinct = [...new Set(found)];
    if (distinct.length < 2) continue;
    faults++;
    console.log(`#${r.id} (${r.status}, ${r.format}) two ${what}s: ${distinct.join(" and ")}`);
    console.log(`   ${stem.replace(/\s+/g, " ").slice(0, 300)}`);
  }
}

console.log(`\n${rows.length} stem(s) read; ${faults} give the same fact twice`);
