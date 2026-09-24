/**
 * Propose the missing distractors for EMQ sets audit-distractors flagged.
 *
 *   AUDIT_DUMP=readings.json npx tsx scripts/audit-distractors.mts
 *   npx tsx scripts/propose-distractors.mts readings.json out.json [limit]
 *
 * A flagged scenario asks for a category — a duration, a contraceptive
 * method, a gestation — that the shared list barely contains, so the
 * candidate finds the answer by shape. The repair is to give that
 * category company: options that read as the same sort of thing, that a
 * trainee could believe, and that are wrong for every scenario in the
 * set.
 *
 * This proposes; it writes nothing. The proposals are read before they
 * are applied, because an option that is accidentally a better answer
 * than the marked one breaks the question it was meant to repair.
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
const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const { getChunksByIds } = await import("../src/lib/retrieval");

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

type Reading = {
  setId: number;
  status: string;
  options: number;
  scenarios: number;
  kinds: string;
  verdicts: { id: number; kind?: string; sameKind: number }[];
};

const readings: Reading[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const outPath = process.argv[3];
const limit = Number(process.argv[4] ?? NaN);

const THRESHOLD = 2;
const flagged = readings
  .filter((r) => r.verdicts.some((v) => v.sameKind <= THRESHOLD))
  .sort((a, b) => a.setId - b.setId);
const work = Number.isFinite(limit) ? flagged.slice(0, limit) : flagged;

const SYSTEM = `You write extended matching questions for the MRCOG Part 2, sat by UK obstetrics and gynaecology trainees at ST5 level.

You are given an EMQ set whose shared option list is short of one or more categories. A scenario asks for a category — a duration, a gestation, a contraceptive method, an investigation — and the list holds only one or two options of it, so a candidate finds the answer by shape rather than by knowing the case.

Propose additional options so that each named category has at least four members. Every proposed option must:
  - read as the same sort of thing as the others of its category, and at a similar length and register;
  - be something a competent ST5 could seriously entertain — a real drug, dose, interval, gestation or procedure from this area of practice, not an invention;
  - be WRONG for every scenario in this set. Check each scenario in turn. If an option could be argued as the answer to any of them, do not propose it;
  - use UK spelling (oestrogen, haemorrhage, anaesthesia, paediatric), and no American terms.

Do not change the existing options, the stems or the answers. Do not propose an option that duplicates the meaning of one already in the list.

Reply with JSON only:
{"proposals":[{"category":"<the short category name>","text":"<the new option>","wrongBecause":"<one clause: why it is not the answer to any scenario here>"}]}

If the list already gives every category enough company, reply {"proposals":[]}.`;

type Proposal = { category: string; text: string; wrongBecause: string };

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

const out: {
  setId: number;
  status: string;
  groupId: string;
  short: { id: number; kind?: string; sameKind: number }[];
  options: { key: string; text: string }[];
  proposals: Proposal[];
}[] = [];

let done = 0;
let failed = 0;

for (const reading of work) {
  const { data: seed } = await db
    .from("generated_questions")
    .select("emq_group_id")
    .eq("id", reading.setId)
    .single();
  if (!seed?.emq_group_id) continue;
  const { data: set } = await db
    .from("generated_questions")
    .select("id, stem, lead_in, correct_key, options, explanations, citation_chunk_ids")
    .eq("emq_group_id", seed.emq_group_id)
    .order("id");
  if (!set?.length) continue;

  const options = (set[0].options ?? []) as { key: string; text: string }[];
  const short = reading.verdicts.filter((v) => v.sameKind <= THRESHOLD);

  // The passages the set is built on, so proposals stay in its world.
  const chunkIds = [
    ...new Set(set.flatMap((r) => (r.citation_chunk_ids ?? []) as number[])),
  ].slice(0, 6);
  const passages = await getChunksByIds(chunkIds);

  const body = [
    `LEAD-IN: ${set[0].lead_in ?? "(none)"}`,
    ``,
    `OPTIONS:`,
    options.map((o) => `${o.key}. ${o.text}`).join("\n"),
    ``,
    `SCENARIOS:`,
    set
      .map(
        (s) =>
          `Question id ${s.id} — answer ${s.correct_key} (${
            options.find((o) => o.key === s.correct_key)?.text ?? "?"
          })\n${s.stem}`
      )
      .join("\n\n"),
    ``,
    `SHORT OF: ${short
      .map((v) => `scenario ${v.id} asks for a ${v.kind}, list holds ${v.sameKind}`)
      .join("; ")}`,
    ``,
    `SOURCE PASSAGES (for what is real in this area):`,
    passages.map((p) => p.text.slice(0, 1200)).join("\n---\n"),
  ].join("\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { proposals: Proposal[] };
    out.push({
      setId: reading.setId,
      status: reading.status,
      groupId: seed.emq_group_id,
      short,
      options,
      proposals: parsed.proposals ?? [],
    });
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  set #${reading.setId}: ${(e as Error).message}`);
  }
  done++;
  if (done % 10 === 0) console.error(`  ${done}/${work.length} …`);
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

console.log(`${out.length} set(s) proposed for, ${failed} failed\n`);
for (const r of out) {
  console.log(`set #${r.setId} (${r.status}) — ${r.short.map((v) => `#${v.id} ${v.sameKind}× ${v.kind}`).join(", ")}`);
  for (const p of r.proposals) {
    console.log(`  + [${p.category}] ${p.text}`);
    console.log(`      ${p.wrongBecause}`);
  }
  if (r.proposals.length === 0) console.log(`  (nothing proposed)`);
}
