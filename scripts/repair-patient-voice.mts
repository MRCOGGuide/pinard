/**
 * Rewrite the closing of stems that put a technical question in a
 * patient's mouth.
 *
 *   npx tsx scripts/repair-patient-voice.mts voice.txt out.json
 *   npx tsx scripts/repair-patient-voice.mts voice.txt out.json --apply
 *
 * The vignette is sound and the fact is worth testing; only the voice is
 * wrong. #1529 went from "she asks what proportion of circulating
 * testosterone is biologically active" to "You are counselling her about
 * the physiological basis of her symptoms. What proportion of
 * circulating testosterone in premenopausal women is biologically
 * active?" — the same question, asked by the paper rather than by a
 * woman who would never ask it.
 *
 * Proposes first and writes only with --apply, because a rewritten stem
 * is candidate-facing prose.
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
const { ukEnglishProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

const apply = process.argv.includes("--apply");

/* Read the audit's own report: "#1234 (status, asker) why". */
const report = fs.readFileSync(process.argv[2], "utf8");
const ids: number[] = [];
for (const line of report.split(/\r?\n/)) {
  const m = line.match(/^#(\d+) \(/);
  if (m) ids.push(Number(m[1]));
}
console.error(`${ids.length} stem(s) to repair`);

const SYSTEM = `You are editing one clinical vignette for the MRCOG Part 2.

The vignette is sound except for its closing: it has a patient asking something no patient asks — a population statistic, a laboratory threshold, screening performance in technical terms, or a mechanism in technical vocabulary.

Rewrite ONLY the closing so the paper asks the question instead of the patient. Keep everything else exactly as it is: the same age, history, findings, the same clinical scene, the same fact being tested, the same answer.

Two ways to do it, whichever reads better:
  - address the candidate: "You are counselling her about … . What proportion of …?"
  - give it to the team: "The fetal medicine team is reviewing the referral pattern. What proportion of …?"

Rules:
  - the stem must END in a question mark;
  - do not add clinical detail that was not there, and do not remove any;
  - keep the wording of the question itself as close to the original as you can — it is the voice that is wrong, not the content;
  - UK spelling throughout.

Reply with JSON only:
{"stem":"<the whole rewritten stem>"}`;

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

const out: { id: number; before: string; after: string }[] = [];
const refused: string[] = [];
let done = 0;

for (const id of ids) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem")
    .eq("id", id)
    .single();
  if (!row) continue;
  const before = row.stem as string;

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: before }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const after = (JSON.parse(json) as { stem: string }).stem?.trim();

    if (!after) throw new Error("empty stem");
    if (!after.endsWith("?")) {
      refused.push(`#${id} — rewrite does not end in a question`);
      continue;
    }
    const uk = ukEnglishProblems(after);
    if (uk.length) {
      refused.push(`#${id} — ${uk.join("; ")}`);
      continue;
    }
    /* A rewrite should not rebuild the vignette. */
    const shrank = after.length < before.length * 0.6;
    const grew = after.length > before.length * 1.5;
    if (shrank || grew) {
      refused.push(`#${id} — length changed too far (${before.length} to ${after.length})`);
      continue;
    }
    if (/\b(she|he|the patient|the woman)\s+asks\b/i.test(after)) {
      refused.push(`#${id} — the patient is still the one asking`);
      continue;
    }
    out.push({ id, before, after });
  } catch (e) {
    refused.push(`#${id} — ${(e as Error).message}`);
  }
  done++;
  if (done % 20 === 0) console.error(`  ${done}/${ids.length} …`);
}

fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1));

for (const r of out) {
  console.log(`#${r.id}`);
  console.log(`   was: …${r.before.slice(-165)}`);
  console.log(`   now: …${r.after.slice(-165)}`);
}

if (apply) {
  for (const r of out) {
    const { error } = await db
      .from("generated_questions")
      .update({ stem: r.after })
      .eq("id", r.id);
    if (error) throw new Error(`#${r.id}: ${error.message}`);
  }
}

console.log(`\n${out.length} rewritten${apply ? " and saved" : " (not saved)"}, ${refused.length} refused`);
for (const r of refused) console.log(`  ${r}`);
