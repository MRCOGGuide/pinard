/**
 * Take the em dashes out of everything a candidate reads.
 *
 *   npx tsx scripts/strip-em-dashes.mts out.json
 *   npx tsx scripts/strip-em-dashes.mts out.json --apply
 *
 * An em dash reads as an aside, and a question is not the place for
 * one. 500 questions carry at least one, nearly all of them in the
 * explanations.
 *
 * The model repunctuates; it does not rewrite. The guard is strict and
 * mechanical: strip every character that is not a letter or a digit
 * from the before and the after, lower-case both, and they must be
 * identical. A comma, a colon, a full stop or a bracket may replace
 * the dash, a capital may follow a new full stop, and nothing else can
 * move — a proposal that reworded so much as an "and" is refused.
 *
 * En dashes stay: "24–28 weeks" is a range, which is what they are for.
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
const outPath = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "dashes.json";

type Field =
  | { kind: "stem" }
  | { kind: "lead_in" }
  | { kind: "explanation" }
  | { kind: "option"; key: string }
  | { kind: "explanations"; key: string };

type Proposal = { id: number; field: Field; before: string; after: string };

/* ---------------------------------------------------------------- apply */

if (apply) {
  const proposals = JSON.parse(fs.readFileSync(outPath, "utf8")) as Proposal[];
  const byQuestion = new Map<number, Proposal[]>();
  for (const p of proposals) {
    const list = byQuestion.get(p.id);
    if (list) list.push(p);
    else byQuestion.set(p.id, [p]);
  }

  let written = 0;
  const skipped: string[] = [];
  for (const [id, list] of byQuestion) {
    const { data: row } = await db
      .from("generated_questions")
      .select("id, stem, lead_in, explanation, options, explanations")
      .eq("id", id)
      .single();
    if (!row) {
      skipped.push(`#${id} — not found`);
      continue;
    }
    const patch: Record<string, unknown> = {};
    let options = (row.options ?? []) as { key: string; text: string }[];
    let explanations = (row.explanations ?? []) as { key: string; text: string }[];
    let stale = false;

    for (const p of list) {
      if (p.field.kind === "stem" || p.field.kind === "lead_in" || p.field.kind === "explanation") {
        const current = (row as Record<string, unknown>)[p.field.kind] as string | null;
        if (current !== p.before) {
          stale = true;
          break;
        }
        patch[p.field.kind] = p.after;
      } else if (p.field.kind === "option") {
        const key = p.field.key;
        if (options.find((o) => o.key === key)?.text !== p.before) {
          stale = true;
          break;
        }
        options = options.map((o) => (o.key === key ? { ...o, text: p.after } : o));
        patch.options = options;
      } else {
        const key = p.field.key;
        if (explanations.find((e) => e.key === key)?.text !== p.before) {
          stale = true;
          break;
        }
        explanations = explanations.map((e) =>
          e.key === key ? { ...e, text: p.after } : e
        );
        patch.explanations = explanations;
      }
    }
    if (stale) {
      skipped.push(`#${id} — text has changed since it was proposed`);
      continue;
    }
    const { error } = await db.from("generated_questions").update(patch).eq("id", id);
    if (error) throw new Error(`#${id}: ${error.message}`);
    written++;
  }
  console.log(`${written} question(s) repunctuated, ${skipped.length} skipped`);
  for (const line of skipped) console.log(`  ${line}`);
  process.exit(0);
}

/* -------------------------------------------------------------- propose */

const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

type Row = {
  id: number;
  stem: string | null;
  lead_in: string | null;
  explanation: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, stem, lead_in, explanation, options, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const work: { id: number; field: Field; text: string }[] = [];
for (const r of rows) {
  const push = (field: Field, text: string | null) => {
    if (text && text.includes("—")) work.push({ id: r.id, field, text });
  };
  push({ kind: "stem" }, r.stem);
  push({ kind: "lead_in" }, r.lead_in);
  push({ kind: "explanation" }, r.explanation);
  for (const o of r.options ?? []) push({ kind: "option", key: o.key }, o.text);
  for (const e of r.explanations ?? []) push({ kind: "explanations", key: e.key }, e.text);
}
console.error(`${work.length} field(s) carry an em dash`);

const SYSTEM = `You repunctuate. You do not rewrite.

Each numbered text contains one or more em dashes. Replace each one with the punctuation the sentence would have had without it: a comma, a pair of commas, a colon, a semicolon, brackets, or a full stop with the next word capitalised.

The words must not change. Do not add a word, remove a word, reorder anything, or alter a figure, a unit or a spelling. The only things you may change are the dashes themselves, the punctuation that replaces them, and the capital letter after a new full stop.

Keep en dashes exactly as they are: "24–28 weeks" and "95% CI 1.8–4.6" are ranges.

Reply with JSON only:
{"texts":[{"n":<number>,"text":"<the repunctuated text>"}]}`;

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

/** Letters and digits only: what must survive untouched. */
const bones = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const out: Proposal[] = [];
const refused: string[] = [];
const BATCH = 8;

for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH);
  const body = batch.map((w, n) => `${n + 1}. ${w.text}`).join("\n\n");
  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { texts: { n: number; text: string }[] };
    for (const item of parsed.texts ?? []) {
      const source = batch[item.n - 1];
      if (!source) continue;
      const after = (item.text ?? "").trim();
      if (!after) continue;
      if (after.includes("—")) {
        refused.push(`#${source.id} — a dash survived`);
        continue;
      }
      if (bones(after) !== bones(source.text)) {
        refused.push(`#${source.id} — the words changed`);
        continue;
      }
      out.push({ id: source.id, field: source.field, before: source.text, after });
    }
  } catch (e) {
    refused.push(`batch at ${i} — ${(e as Error).message}`);
  }
  if ((i / BATCH) % 10 === 0) console.error(`  ${i}/${work.length} …`);
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
for (const p of out.slice(0, 8)) {
  console.log(`#${p.id}`);
  console.log(`   was: ${p.before.slice(0, 150)}`);
  console.log(`   now: ${p.after.slice(0, 150)}`);
}
console.log(`\n${out.length} field(s) repunctuated (not saved), ${refused.length} refused`);
for (const line of refused.slice(0, 20)) console.log(`  ${line}`);
