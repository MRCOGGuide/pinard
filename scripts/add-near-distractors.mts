/**
 * Give an answer that stands alone something to stand against.
 *
 *   npx tsx scripts/add-near-distractors.mts near.txt out.json
 *   npx tsx scripts/add-near-distractors.mts out.json --apply
 *
 * Reads the near-distractor audit's report and, for each scenario whose
 * answer has nothing beside it, proposes options that are the answer
 * with one thing changed: a different dose, a different interval, a
 * different drug by the same route, a different figure for the same
 * outcome.
 *
 * A distractor has one job and one danger. The job is to be reachable;
 * the danger is to be right. So each proposal comes with the reason it
 * is wrong, the model is given the passages the question was written
 * from, and every proposal is read by a person before it is written.
 *
 * An EMQ's list belongs to the whole set, so added options are written
 * to every scenario in it, and the keys are reassigned in order.
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

type Proposal = {
  id: number;
  group: string;
  answer: string;
  added: { text: string; wrongBecause: string }[];
};

/* ---------------------------------------------------------------- apply */

if (apply) {
  const proposals = JSON.parse(fs.readFileSync(files[0], "utf8")) as Proposal[];
  let written = 0;
  const skipped: string[] = [];

  for (const p of proposals) {
    const { data: rows } = await db
      .from("generated_questions")
      .select("id, correct_key, options, explanations")
      .eq("emq_group_id", p.group)
      .order("id");
    if (!rows?.length) {
      skipped.push(`#${p.id} — set not found`);
      continue;
    }
    const current = (rows[0].options ?? []) as { key: string; text: string }[];
    const texts = [...current.map((o) => o.text), ...p.added.map((a) => a.text)];
    if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) {
      skipped.push(`#${p.id} — an added option is already in the list`);
      continue;
    }
    const next = [...texts]
      .sort((a, b) => a.localeCompare(b))
      .map((text, i) => ({ key: String.fromCharCode(65 + i), text }));

    for (const row of rows) {
      const options = (row.options ?? []) as { key: string; text: string }[];
      const answerText = options.find((o) => o.key === row.correct_key)?.text;
      const key = next.find((o) => o.text === answerText)?.key;
      if (!key) {
        skipped.push(`#${row.id} — its answer is not in the new list`);
        continue;
      }
      const explanations = (row.explanations ?? []) as { key: string; text: string }[];
      const { error } = await db
        .from("generated_questions")
        .update({
          options: next,
          correct_key: key,
          explanations: explanations.map((e) =>
            e.key === row.correct_key ? { ...e, key } : e
          ),
        })
        .eq("id", row.id);
      if (error) throw new Error(`#${row.id}: ${error.message}`);
    }
    written++;
  }
  console.log(`${written} set(s) widened, ${skipped.length} skipped`);
  for (const line of skipped) console.log(`  ${line}`);
  process.exit(0);
}

/* -------------------------------------------------------------- propose */

const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const { getChunksByIds } = await import("../src/lib/retrieval");
const { selfTalkProblems, ukEnglishProblems, emDashProblems } = await import(
  "../src/lib/generation"
);
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

const report = fs.readFileSync(files[0], "utf8");
const ids: number[] = [];
for (const line of report.split(/\r?\n/)) {
  const m = line.match(/^\s+#(\d+): \d+ near option/);
  if (m) ids.push(Number(m[1]));
}
console.error(`${ids.length} scenario(s) whose answer stands alone`);

const SYSTEM = `You write distractors for an extended matching question sat by UK obstetrics and gynaecology trainees.

You are given a scenario, its option list, the correct answer, and the source passages the question was written from. The problem is that nothing in the list stands near the answer: a candidate can reach it without knowing the medicine.

Write TWO or THREE new options that are the correct answer with ONE thing changed, and that are WRONG. Change the dose, the interval, the drug, the route, the timing, the threshold or the figure, whichever the answer turns on. If the answer is "200 mg twice daily", offer other doses of the same drug. If it is "6 months", offer other intervals. If it is a figure for an outcome, offer other figures for the same outcome, including ones the passages give for a neighbouring outcome.

Rules:
  - each option must be WRONG for this scenario. Say why in a few words;
  - each must be plausible: something a candidate who half-knew the topic would choose;
  - match the style and length of the options already in the list. No em dashes;
  - do not repeat an option already in the list, and do not write two that mean the same;
  - prefer figures, doses and intervals that appear in the passages for something else, because those are the confusions worth testing;
  - UK spelling and UK drug names.

Reply with JSON only:
{"added":[{"text":"<the option>","wrongBecause":"<a few words>"}]}`;

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
    .select("id, stem, lead_in, correct_key, options, explanations, emq_group_id")
    .eq("id", id)
    .single();
  if (!row?.emq_group_id) {
    refused.push(`#${id} — not an EMQ scenario`);
    continue;
  }
  const options = (row.options ?? []) as { key: string; text: string }[];
  const answer = options.find((o) => o.key === row.correct_key)?.text ?? "";
  const explanation = ((row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[]).find((e) => e.key === row.correct_key);
  const passages = await getChunksByIds(explanation?.citation_chunk_ids ?? []);

  const body = [
    `LEAD-IN: ${row.lead_in ?? ""}`,
    `SCENARIO: ${row.stem}`,
    `CORRECT ANSWER: ${answer}`,
    `THE WHOLE LIST:\n${options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
    `WHY IT IS THE ANSWER: ${explanation?.text ?? ""}`,
    `SOURCE PASSAGES:\n${passages.map((p) => p.text).join("\n\n").slice(0, 20000)}`,
  ].join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as {
      added: { text: string; wrongBecause: string }[];
    };
    const added = (parsed.added ?? [])
      .map((a) => ({ text: (a.text ?? "").trim(), wrongBecause: (a.wrongBecause ?? "").trim() }))
      .filter((a) => a.text);
    if (added.length < 2) {
      refused.push(`#${id} — fewer than two options proposed`);
      continue;
    }
    const existing = new Set(options.map((o) => o.text.toLowerCase()));
    const clash = added.find((a) => existing.has(a.text.toLowerCase()));
    if (clash) {
      refused.push(`#${id} — "${clash.text.slice(0, 50)}" is already in the list`);
      continue;
    }
    const problems = added.flatMap((a) => [
      ...selfTalkProblems(a.text),
      ...ukEnglishProblems(a.text),
      ...emDashProblems(a.text),
    ]);
    if (problems.length) {
      refused.push(`#${id} — ${problems[0]}`);
      continue;
    }
    /*
      The answer must not stand out among the options it now competes
      with. Comparing it against the whole list was wrong: #1880's
      answer, "200 mg twice daily", was the longest thing in a list of
      bare percentages, which is the very problem the added doses fix.
      What matters is that it does not tower over its new neighbours.
    */
    const longestAdded = Math.max(...added.map((a) => a.text.length));
    if (answer.length > longestAdded + 10) {
      refused.push(`#${id} - the answer would still tower over its neighbours`);
      continue;
    }
    out.push({ id, group: row.emq_group_id, answer, added });
  } catch (e) {
    refused.push(`#${id} — ${(e as Error).message}`);
  }
}

fs.writeFileSync(files[1] ?? "near-options.json", JSON.stringify(out, null, 1));
for (const p of out) {
  console.log(`#${p.id}  answer: ${p.answer}`);
  for (const a of p.added) console.log(`   + ${a.text}   (${a.wrongBecause})`);
}
console.log(`\n${out.length} scenario(s) widened (not saved), ${refused.length} refused`);
for (const line of refused) console.log(`  ${line}`);
