/**
 * Repair vignettes whose own facts contradict the answer they carry.
 *
 *   npx tsx scripts/repair-coherence.mts coherence.txt ids.txt out.json
 *   npx tsx scripts/repair-coherence.mts coherence.txt ids.txt out.json --apply
 *
 * In nearly every case the answer is right and grounded, the medicine is
 * worth testing, and one detail in the vignette makes the case
 * impossible: a polyp already resected before "complete the
 * polypectomy", a carbimazole dose of exactly 10 mg against a rule that
 * says less than 10 mg, a woman already under the drug and alcohol team
 * before "refer to addiction services".
 *
 * So the detail moves, not the answer. Proposes first; writes only with
 * --apply.
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
const { ukEnglishProblems, studyAttributionProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

const apply = process.argv.includes("--apply");

/* The audit's report, for the contradiction it found in each. */
const report = fs.readFileSync(process.argv[2], "utf8");
const found = new Map<number, { quote: string; why: string }>();
{
  const lines = report.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#(\d+) \(/);
    if (!m) continue;
    const quote = (lines[i + 1] ?? "").trim().replace(/^"|"$/g, "");
    const why = (lines[i + 2] ?? "").trim();
    found.set(Number(m[1]), { quote, why });
  }
}

const ids = fs
  .readFileSync(process.argv[3], "utf8")
  .split(/\s+/)
  .map((s) => Number(s.replace("#", "")))
  .filter((n) => Number.isFinite(n) && n > 0);
console.error(`${ids.length} to repair`);

const SYSTEM = `You are repairing one clinical vignette for the MRCOG Part 2.

The answer it carries is correct and grounded in guidance. One detail in the vignette contradicts it — the step is already done, a stated value misses the threshold the answer depends on, a stated fact rules the answer out, or the case could not have happened as described.

Change the vignette so the marked answer is the right next step, and change nothing else.

Rules:
  - edit the smallest amount of text that removes the contradiction. Usually one clause or one number;
  - do NOT change the answer, and do not change which fact is being tested;
  - do not add clinical detail beyond what the repair needs, and do not delete detail the case relies on;
  - keep the vignette's voice, tense and length;
  - a value that must meet a threshold should clearly meet it, not sit on the boundary;
  - UK spelling, and never name a study, trial, cohort or registry;
  - if the question itself asks the wrong thing — the stem asks for one kind of answer and the marked answer is another — rewrite the closing question so it asks for what the answer actually is.

If the contradiction cannot be removed without changing what is tested, reply {"stem": null, "reason": "<one clause>"}.

Reply with JSON only:
{"stem":"<the whole repaired vignette>"}`;

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
    .select("id, stem, correct_key, options, explanations")
    .eq("id", id)
    .single();
  if (!row) {
    refused.push(`#${id} — not found`);
    continue;
  }
  const before = row.stem as string;
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answer = options.find((o) => o.key === row.correct_key)?.text ?? "?";
  const working =
    ((row.explanations ?? []) as { key: string; text: string }[]).find(
      (e) => e.key === row.correct_key
    )?.text ?? "";
  const flag = found.get(id);

  const body = [
    `VIGNETTE: ${before}`,
    `MARKED ANSWER: ${answer}`,
    working ? `WHY IT IS THE ANSWER: ${working}` : "",
    flag ? `THE CONTRADICTION: ${flag.quote}\n${flag.why}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 1100,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { stem: string | null; reason?: string };
    if (!parsed.stem) {
      refused.push(`#${id} — ${parsed.reason ?? "cannot be repaired"}`);
      continue;
    }
    const after = parsed.stem.trim();
    if (after === before) {
      refused.push(`#${id} — unchanged`);
      continue;
    }
    const uk = ukEnglishProblems(after);
    if (uk.length) {
      refused.push(`#${id} — ${uk.join("; ")}`);
      continue;
    }
    const study = studyAttributionProblems(after);
    if (study.length) {
      refused.push(`#${id} — names evidence: ${study[0].slice(0, 80)}`);
      continue;
    }
    if (after.length < before.length * 0.6 || after.length > before.length * 1.6) {
      refused.push(`#${id} — length changed too far (${before.length} to ${after.length})`);
      continue;
    }
    out.push({ id, before, after });
  } catch (e) {
    refused.push(`#${id} — ${(e as Error).message}`);
  }
  done++;
  if (done % 10 === 0) console.error(`  ${done}/${ids.length} …`);
}

fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));

for (const r of out) {
  console.log(`#${r.id}`);
  const a = r.before;
  const b = r.after;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  console.log(`   was: …${a.slice(Math.max(0, i - 50), i + 130)}`);
  console.log(`   now: …${b.slice(Math.max(0, i - 50), i + 130)}`);
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

console.log(`\n${out.length} repaired${apply ? " and saved" : " (not saved)"}, ${refused.length} refused`);
for (const r of refused) console.log(`  ${r}`);
