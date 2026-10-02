/**
 * Explanations that cite instead of stating.
 *
 *   npx tsx scripts/strip-guideline-narration.mts out.json
 *   npx tsx scripts/strip-guideline-narration.mts out.json --apply
 *
 * "The 2014 ESHRE guidelines explicitly state they should not be
 * prescribed until every other treatment avenue has been tried" says
 * the same thing as "they are not prescribed until every other
 * treatment has been tried", with a document and a date in front of
 * it. The card prints the source underneath, so the prose says it
 * twice, and the date ages the question the moment the guideline is
 * reissued.
 *
 * The existing narration lint looks for "the guideline states" and
 * nothing between the two words. These slipped through it: "the 2014
 * ESHRE guidelines explicitly state", "The EMAS position statement
 * recommends", "The guidance stipulates".
 *
 * One sentence is rewritten, never the paragraph, and the result is
 * checked for the thing it was rewritten to remove. Proposes first;
 * --apply writes the file it is given.
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
const apply = process.argv.includes("--apply");
const outPath = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "narration.json";

type Proposal = { id: number; key: string; before: string; after: string };

/* ---------------------------------------------------------------- apply */

if (apply) {
  const proposals = JSON.parse(fs.readFileSync(outPath, "utf8")) as Proposal[];
  let written = 0;
  const skipped: string[] = [];
  for (const p of proposals) {
    const { data: row } = await db
      .from("generated_questions")
      .select("id, explanations")
      .eq("id", p.id)
      .single();
    if (!row) {
      skipped.push(`#${p.id} — not found`);
      continue;
    }
    const explanations = (row.explanations ?? []) as { key: string; text: string }[];
    const current = explanations.find((e) => e.key === p.key);
    if (!current) {
      skipped.push(`#${p.id} — no explanation for ${p.key}`);
      continue;
    }
    if (current.text !== p.before) {
      skipped.push(`#${p.id} — the explanation has changed since it was proposed`);
      continue;
    }
    const { error } = await db
      .from("generated_questions")
      .update({
        explanations: explanations.map((e) =>
          e.key === p.key ? { ...e, text: p.after } : e
        ),
      })
      .eq("id", p.id);
    if (error) throw new Error(`#${p.id}: ${error.message}`);
    written++;
  }
  console.log(`${written} rewritten, ${skipped.length} skipped`);
  for (const line of skipped) console.log(`  ${line}`);
  process.exit(0);
}

/* -------------------------------------------------------------- propose */

const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const { ukEnglishProblems, selfTalkProblems } = await import("../src/lib/generation");
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

/** A named document doing the talking. */
const NARRATES =
  /\bthe\s+(?:\d{4}\s+)?(?:[A-Z][A-Za-z-]+\s+){0,3}(?:guideline|guidelines|guidance|recommendations?|statement)\s+(?:explicitly\s+|clearly\s+|specifically\s+)?(?:states?|says?|recommends?|advises?|suggests?|notes?|specifies|requires?|mandates?|stipulates?)\b/i;
/** A body with a year beside it: an edition reference, which ages. */
const EDITION =
  /\b(?:19|20)\d{2}\s+(?:ESHRE|NICE|RCOG|BSGE|BASHH|FSRH|WHO|ACOG|SOGC|BMS|BGCS|EMAS|MBRRACE|UKOSS)\b|\b(?:ESHRE|NICE|RCOG|BSGE|BASHH|FSRH|WHO|ACOG|SOGC|BMS|BGCS|EMAS|MBRRACE|UKOSS)\s+(?:19|20)\d{2}\b/;

type Row = {
  id: number;
  status: string;
  correct_key: string;
  explanations: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, correct_key, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const work = rows.filter((r) => {
  const text = (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "";
  return NARRATES.test(text) || EDITION.test(text);
});
console.error(`${work.length} explanation(s) let a document do the talking`);

const SYSTEM = `You are editing one sentence of the explanation printed under an answered MRCOG Part 2 question.

The sentence credits a named guideline, or dates one: "the 2014 ESHRE guidelines explicitly state that…", "The EMAS position statement recommends…", "NICE 2013 advises…".

Rewrite that sentence so it states the medicine directly, as a senior colleague would say it. Keep every clinical fact, figure, threshold and qualifier exactly as it is. Remove only the document, the body and the year.

Rules:
  - rewrite ONE sentence. Return the whole explanation with that sentence replaced and everything else identical;
  - do not add a fact, and do not drop one. "The 2014 ESHRE guidelines explicitly state they should not be prescribed until every other treatment avenue has been tried" becomes "They are not prescribed until every other treatment avenue has been tried";
  - keep the length within a few words of the original;
  - never name a guideline, a college, a society, a trial or a year of publication;
  - UK spelling.

Reply with JSON only:
{"explanation":"<the whole explanation, one sentence rewritten>"}`;

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

const out: Proposal[] = [];
const refused: string[] = [];

for (const r of work) {
  const explanation = (r.explanations ?? []).find((e) => e.key === r.correct_key);
  const before = explanation?.text ?? "";
  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: before }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const after = (JSON.parse(json) as { explanation: string }).explanation?.trim();
    if (!after) throw new Error("empty");
    if (NARRATES.test(after) || EDITION.test(after)) {
      refused.push(`#${r.id} — still cites: ${(after.match(NARRATES) ?? after.match(EDITION) ?? [""])[0]}`);
      continue;
    }
    const problems = [...ukEnglishProblems(after), ...selfTalkProblems(after)];
    if (problems.length) {
      refused.push(`#${r.id} — ${problems.join("; ")}`);
      continue;
    }
    /* Every figure in the original has to survive the rewrite. */
    const figures = (before.match(/\d+(?:\.\d+)?/g) ?? []).filter((n) => !/^(19|20)\d{2}$/.test(n));
    const lost = figures.filter((f) => !after.includes(f));
    if (lost.length) {
      refused.push(`#${r.id} — lost ${lost.join(", ")}`);
      continue;
    }
    const ratio = after.split(/\s+/).length / Math.max(1, before.split(/\s+/).length);
    if (ratio < 0.75 || ratio > 1.25) {
      refused.push(`#${r.id} — length changed too far (${ratio.toFixed(2)})`);
      continue;
    }
    out.push({ id: r.id, key: r.correct_key, before, after });
  } catch (e) {
    refused.push(`#${r.id} — ${(e as Error).message}`);
  }
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const p of out) {
  console.log(`#${p.id}`);
  console.log(`   was: ${p.before}`);
  console.log(`   now: ${p.after}`);
}
console.log(`\n${out.length} rewritten (not saved), ${refused.length} refused`);
for (const line of refused) console.log(`  ${line}`);
