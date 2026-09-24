/**
 * After widening an option list: is the marked answer still the single
 * best one?
 *
 *   npx tsx scripts/verify-best-answer.mts proposals.json
 *   npx tsx scripts/verify-best-answer.mts proposals.json set:522
 *
 * Adding distractors is the repair for a list that gave its answers away
 * by category. It also introduces the one way that repair can go wrong:
 * an added option that a candidate could defend better than the marked
 * one. The proposal step was told to check; this checks after the fact,
 * against what is actually in the bank.
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

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

const only = process.argv.find((a) => a.startsWith("set:"));

type Entry = { setId: number; groupId: string; status: string };
const entries: Entry[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

const SYSTEM = `You are marking extended matching questions for the MRCOG Part 2, sat by UK obstetrics and gynaecology trainees at ST5 level.

For each scenario you are given the shared option list, the stem, and the option the bank marks as correct.

Answer one question per scenario: reading the stem and the whole list, is the marked option the single best answer, or is another option equally good or better?

Be strict about "equally good": an option that a well-prepared candidate could defend as the answer, and that no wording in the stem rules out, counts as a rival. Being merely reasonable in general practice does not; it has to fit this stem.

Reply with JSON only:
{"scenarios":[{"id":<question id>,"best":true|false,"rival":"<the option letter and a short reason, only when best is false>"}]}`;

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

type Verdict = { id: number; best: boolean; rival?: string };

let checked = 0;
let failed = 0;
const disputed: { setId: number; status: string; verdicts: Verdict[] }[] = [];

for (const entry of entries) {
  if (only && entry.setId !== Number(only.slice(4))) continue;
  const { data: set } = await db
    .from("generated_questions")
    .select("id, stem, lead_in, correct_key, options")
    .eq("emq_group_id", entry.groupId)
    .order("id");
  if (!set?.length) continue;

  const options = (set[0].options ?? []) as { key: string; text: string }[];
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
          `Question id ${s.id} — marked answer ${s.correct_key}\n${s.stem}`
      )
      .join("\n\n"),
  ].join("\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { scenarios: Verdict[] };
    const bad = (parsed.scenarios ?? []).filter((v) => !v.best);
    if (bad.length) disputed.push({ setId: entry.setId, status: entry.status, verdicts: bad });
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  set #${entry.setId}: ${(e as Error).message}`);
  }
  checked++;
  if (checked % 10 === 0) console.error(`  ${checked} …`);
}

console.log(`${checked} set(s) checked, ${failed} unreadable\n`);
console.log(`${disputed.length} set(s) where the marked answer is disputed\n`);
for (const d of disputed) {
  console.log(`set #${d.setId} (${d.status})`);
  for (const v of d.verdicts) console.log(`  #${v.id}: ${v.rival ?? "rival not named"}`);
}
