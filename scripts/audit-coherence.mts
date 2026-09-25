/**
 * Vignettes whose own facts contradict the answer they are marked with.
 *
 *   npx tsx scripts/audit-coherence.mts
 *   npx tsx scripts/audit-coherence.mts 40          # the first 40
 *   npx tsx scripts/audit-coherence.mts only:1538
 *
 * #1538 read "a 32-year-old woman with a KNOWN abdominal pregnancy is
 * admitted at 18 weeks" and was answered "immediate termination of
 * pregnancy" — the guidance being that termination follows diagnosis at
 * once. If it was known, it was not done at once, and the case cannot
 * have happened. The knowledge was sound and the answer was right; the
 * history made both impossible.
 *
 * This is not the timing audit, which catches an answer anchored to a
 * moment the stem has already passed. Here the stem is consistent with
 * itself and inconsistent with its answer: the step is already done,
 * long overdue, ruled out by a stated finding, or impossible at the
 * stage described.
 *
 * Every question is read, because the fault has no reliable wording. A
 * prefilter on "known" or "previously" would have found #1538 and
 * missed a vignette that is stable on every observation and answered
 * with an emergency laparotomy.
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
const { claudeClient, claudeModel } = await import("../src/lib/anthropic");

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, correct_key, options, explanations")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const arg = process.argv[2];
let work = rows;
if (arg?.startsWith("only:")) {
  const ids = new Set(arg.slice(5).split(",").map(Number));
  work = rows.filter((r) => ids.has(r.id));
} else if (Number.isFinite(Number(arg))) {
  work = rows.slice(0, Number(arg));
}

const SYSTEM = `You check clinical vignettes for the MRCOG Part 2 against the answer each is marked with.

Decide ONE thing per vignette: does a fact the vignette itself states make the marked answer impossible, already done, or long overdue?

The fault looks like this. A vignette says a condition was already KNOWN, while the answer is the step that guidance says follows diagnosis immediately — so the step should have happened weeks ago and the case could not have arisen. Or the vignette says a treatment has already been given and the answer is to give it. Or a stated finding rules the answer out: the woman is described as stable on every observation and the answer is an emergency laparotomy for shock. Or the stage described makes the answer impossible: an investigation that can only be done before a gestation the woman has passed.

Judge the VIGNETTE'S STATED FACTS against the MARKED ANSWER, and nothing else. These are NOT faults:
  - a history that is simply background and does not bear on the answer;
  - a question that asks for a figure, a threshold or a definition rather than a next step. A woman booking at 8 weeks, asked by when a referral should happen, is not contradicted by the answer "by 10 weeks";
  - an answer you would argue with on clinical grounds — being debatable is not being impossible;
  - an omission. A vignette that does not mention something is not contradicting anything;
  - a plan or schedule that happens to include a step already taken. "Ultrasound every 4 weeks from 28 to 36 weeks" is still the right plan for a woman who has just had her 28-week scan;
  - a disagreement between the answer and the explanation. That is a different question from the one you are answering. Only the vignette's own facts count.

Be strict. Flag only where you can quote the words from the VIGNETTE that make the answer impossible, already done, or long overdue. If you find yourself writing "borderline", "arguably", or "however", the answer is flag: false.

Reply with JSON only:
{"stems":[{"id":<id>,"flag":true|false,"quote":"<the contradicting words, copied verbatim, only when flag is true>","why":"<one short clause, only when flag is true>"}]}`;

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

type Verdict = { id: number; flag: boolean; quote?: string; why?: string };

const BATCH = 6;
const flagged: (Verdict & { status: string; format: string; answer: string })[] = [];
let done = 0;
let failed = 0;

for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH);
  const body = batch
    .map((r) => {
      const answer =
        (r.options ?? []).find((o) => o.key === r.correct_key)?.text ?? "?";
      const working =
        (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "";
      return [
        `--- id ${r.id} ---`,
        `VIGNETTE: ${r.stem}`,
        `MARKED ANSWER: ${answer}`,
        working ? `WHY IT IS THE ANSWER: ${working.slice(0, 600)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { stems: Verdict[] };
    for (const v of parsed.stems ?? []) {
      if (!v.flag) continue;
      const row = batch.find((r) => r.id === v.id);
      if (!row) continue;
      // A flag with nothing quoted is a hunch, and the brief said not to.
      if (!v.quote?.trim()) continue;
      /*
        The quote has to come from the vignette. Told to judge the
        vignette against the answer, it keeps quoting the answer instead
        and arguing the medicine — #78 was flagged for saying stillbirth
        risk is unchanged at 52 micromol/L, which is what the guidance
        says. Enforced here rather than asked for again.
      */
      const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
      if (!normalise(row.stem).includes(normalise(v.quote).slice(0, 40))) continue;
      flagged.push({
        ...v,
        status: row.status,
        format: row.format,
        answer:
          (row.options ?? []).find((o) => o.key === row.correct_key)?.text ?? "?",
      });
    }
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  batch at ${i}: ${(e as Error).message}`);
  }
  done += batch.length;
  if (done % 120 === 0) console.error(`  ${done}/${work.length} …`);
}

console.log(
  `${work.length} question(s) read; ${flagged.length} state something that contradicts their answer\n`
);
for (const f of flagged.sort((a, b) => a.id - b.id)) {
  console.log(`#${f.id} (${f.status}, ${f.format}) answer: ${f.answer}`);
  console.log(`   "${(f.quote ?? "").trim().slice(0, 160)}"`);
  console.log(`   ${f.why ?? ""}`);
}
if (failed) console.log(`\n${failed} batch(es) could not be read`);
