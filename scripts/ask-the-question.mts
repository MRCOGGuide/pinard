/**
 * Give a scenario that stops on an intention its closing question.
 *
 *   npx tsx scripts/ask-the-question.mts unasked.txt out.json
 *   npx tsx scripts/ask-the-question.mts out.json --apply
 *
 * The model chooses; it does not write. It is given the scenario, its
 * lead-in and its options, and picks one closing from the list the
 * bank already uses — "What is the most appropriate next step?", "What
 * figure should she be quoted?" and the dozen others — and this script
 * appends it. A choice from a fixed list cannot smuggle a new clinical
 * fact into a stem, which a rewrite could, and these are stems a
 * reviewer has already approved.
 *
 * --apply writes the file it is given, and skips any row whose stem has
 * moved since the proposal was written.
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
const apply = process.argv.includes("--apply");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));

type Proposal = { id: number; before: string; after: string; closing: string };

/* ---------------------------------------------------------------- apply */

if (apply) {
  const proposals = JSON.parse(fs.readFileSync(files[0], "utf8")) as Proposal[];
  let written = 0;
  const skipped: string[] = [];
  for (const p of proposals) {
    const { data: row } = await db
      .from("generated_questions")
      .select("id, stem")
      .eq("id", p.id)
      .single();
    if (!row) {
      skipped.push(`#${p.id} — not found`);
      continue;
    }
    if (row.stem !== p.before) {
      skipped.push(`#${p.id} — the stem has changed since it was proposed`);
      continue;
    }
    const { error } = await db
      .from("generated_questions")
      .update({ stem: p.after })
      .eq("id", p.id);
    if (error) throw new Error(`#${p.id}: ${error.message}`);
    written++;
  }
  console.log(`${written} scenario(s) now ask, ${skipped.length} skipped`);
  for (const line of skipped) console.log(`  ${line}`);
  process.exit(0);
}

/* -------------------------------------------------------------- propose */

const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

/** Every closing this bank already uses, most-used first. */
const CLOSINGS = [
  "What is the most appropriate next step?",
  "What is the most appropriate next step in her management?",
  "What is the most appropriate next step in management?",
  "What is the most appropriate management?",
  "What is the most appropriate investigation?",
  "What is the most appropriate next investigation?",
  "What is the most appropriate surgical management?",
  "What is the most appropriate advice?",
  "What is the most appropriate recommendation?",
  "What is the most appropriate treatment?",
  "What figure should she be quoted?",
  "What figure should be quoted?",
  "What is the correct figure?",
  "What is the most likely diagnosis?",
  "What is the most appropriate timing?",
  "What is the most appropriate agent?",
];

const report = fs.readFileSync(files[0], "utf8");
const ids: number[] = [];
{
  const lines = report.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#(\d+) \(/);
    if (!m) continue;
    if (!/ends on an intention/.test(lines[i + 1] ?? "")) continue;
    ids.push(Number(m[1]));
  }
}
console.error(`${ids.length} scenario(s) to close`);

const SYSTEM = `You are choosing the closing question for one MRCOG Part 2 scenario.

The scenario ends on what the team intend to do and never asks anything. You are given the scenario, the lead-in that introduces its option list, and the options themselves.

Choose the ONE closing question from the list below that fits what the options are and what the scenario is driving at. Copy it exactly — do not reword it, do not write your own.

${CLOSINGS.map((c) => `  - ${c}`).join("\n")}

Guidance:
  - if every option is a number or a percentage, it is one of the figure questions;
  - if the options are investigations, prefer the investigation wording; if they are drugs, the agent wording; if they are operations, the surgical wording;
  - if the options are a mixture, or are management steps, "What is the most appropriate next step?" is the house default;
  - match the lead-in. If it says "next step in management", do not close on a diagnosis.

Reply with JSON only:
{"closing":"<one of the lines above, copied exactly>"}`;

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

for (const id of ids) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, lead_in, options, format")
    .eq("id", id)
    .single();
  if (!row) {
    refused.push(`#${id} — not found`);
    continue;
  }
  const before = (row.stem as string).trim();
  if (before.endsWith("?")) {
    refused.push(`#${id} — already asks`);
    continue;
  }
  const options = (row.options ?? []) as { key: string; text: string }[];
  const body = [
    `LEAD-IN: ${row.lead_in ?? "(none — this is a single best answer question)"}`,
    `SCENARIO: ${before}`,
    `OPTIONS:\n${options.map((o) => `  ${o.key}. ${o.text}`).join("\n")}`,
  ].join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 200,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const closing = (JSON.parse(json) as { closing: string }).closing?.trim();
    /* The whole guard: it may only choose, never compose. */
    if (!closing || !CLOSINGS.includes(closing)) {
      refused.push(`#${id} — wrote its own closing: ${closing?.slice(0, 60)}`);
      continue;
    }
    out.push({ id, before, after: `${before} ${closing}`, closing });
  } catch (e) {
    refused.push(`#${id} — ${(e as Error).message}`);
  }
}

fs.writeFileSync(files[1], JSON.stringify(out, null, 1));
for (const p of out) {
  console.log(`#${p.id}  ${p.closing}`);
  console.log(`   …${p.before.slice(-110)}`);
}
console.log(`\n${out.length} closing(s) proposed (not saved), ${refused.length} refused`);
for (const line of refused) console.log(`  ${line}`);
