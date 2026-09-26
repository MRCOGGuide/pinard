/**
 * Explanations whose arithmetic disagrees with their own vignette.
 *
 *   npx tsx scripts/audit-explanation-agrees.mts
 *   npx tsx scripts/audit-explanation-agrees.mts 60
 *   npx tsx scripts/audit-explanation-agrees.mts only:1623
 *
 * #1623 put a woman eight months into HRT, bleeding since week four,
 * and explained that "this woman's bleeding began within the first few
 * months of commencing HRT and has not yet reached that threshold". On
 * the stem's own figures she was a month past it. The rule quoted was
 * the right rule; it was applied to the wrong side of its own number.
 *
 * The same reading catches a stem that disagrees with itself: #1623
 * also opened on "a two-week history of vaginal bleeding" and then
 * dated the bleeding to four weeks after an eight-month-old
 * prescription.
 *
 * This is deliberately NOT the coherence audit, which weighs the
 * vignette against the marked answer and is told to ignore the
 * explanation. Here the answer is assumed right and the prose around
 * it is checked for arithmetic.
 *
 * Both halves of a flag must be quoted verbatim and both quotes are
 * checked against the text they came from, because a model asked to
 * find a contradiction will otherwise write one.
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

const SYSTEM = `You check the arithmetic of MRCOG Part 2 questions. The medicine is not your business and the marked answer is assumed correct.

Read the VIGNETTE and the EXPLANATION printed under it, and decide ONE thing: do their numbers agree?

Two faults count.

1. THE EXPLANATION MISREADS THE VIGNETTE. It states something about this woman that the vignette contradicts, or applies a threshold to the wrong side of its own figures. The vignette says she has been on HRT eight months and bled from week four; the explanation says her bleeding "has not yet reached" the six-month threshold. The vignette says her BMI is 41; the explanation calls her BMI under 40. The vignette says 32 weeks; the explanation reasons from 28.

2. THE VIGNETTE DISAGREES WITH ITSELF. Two figures for the same thing that cannot both be true: "a two-week history of bleeding" and "the bleeding began four weeks after she started HRT" eight months ago; two different ages for the same woman; a value in the history contradicting the same value in the examination findings.

These are NOT faults:
  - a figure the explanation gives as guidance rather than as a fact about her — thresholds, bands, population rates, the dose in a regimen. "Referral is indicated after 6 months" is the rule, not a claim about this woman;
  - the explanation teaching something the vignette never mentioned. An omission is not a contradiction;
  - the same quantity written two ways that agree: 8 weeks and 2 months, 1 in 200 and 0.5%, 37+5 and "nearly 38 weeks", "her late thirties" and 38;
  - rounding, approximation, or "around", "about", "up to";
  - two different quantities that merely look alike: her age and her gestation, a BMI and a cervical length, a parity and a dose;
  - a number belonging to somebody else — a partner's age, a previous pregnancy, a sibling, the baby;
  - a difference of medical opinion. You are checking arithmetic only.

Be strict. Flag only when you can copy BOTH conflicting phrases word for word — one from the vignette, one from the explanation (for fault 2, both from the vignette). If you find yourself writing "arguably" or "unclear", the answer is flag: false.

Reply with JSON only:
{"cards":[{"id":<id>,"flag":true|false,"fault":"explanation"|"vignette","stemQuote":"<verbatim from the vignette>","otherQuote":"<verbatim from the explanation, or the second phrase from the vignette>","why":"<one short clause>"}]}`;

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

type Verdict = {
  id: number;
  flag: boolean;
  fault?: "explanation" | "vignette";
  stemQuote?: string;
  otherQuote?: string;
  why?: string;
};

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const BATCH = 5;
const flagged: (Verdict & { status: string; format: string })[] = [];
let done = 0;
let failed = 0;

for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH);
  const body = batch
    .map((r) => {
      const answer = (r.options ?? []).find((o) => o.key === r.correct_key)?.text ?? "?";
      const working = (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "";
      return [
        `--- id ${r.id} ---`,
        `VIGNETTE: ${r.stem}`,
        `MARKED ANSWER: ${answer}`,
        `EXPLANATION: ${working}`,
      ].join("\n");
    })
    .join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { cards: Verdict[] };
    for (const v of parsed.cards ?? []) {
      if (!v.flag) continue;
      const row = batch.find((r) => r.id === v.id);
      if (!row) continue;
      const stem = tidy(row.stem);
      const working = tidy(
        (row.explanations ?? []).find((e) => e.key === row.correct_key)?.text ?? ""
      );
      const first = tidy(v.stemQuote ?? "");
      const second = tidy(v.otherQuote ?? "");
      if (first.length < 8 || second.length < 8) continue;
      /*
        It talks itself out of a flag and leaves the flag set, exactly
        as the coherence audit does: "…which is arithmetically
        consistent with three months < six months. No numeric
        contradiction." — flag: true. Read the retraction, not the
        field.
      */
      if (
        /\bflag:\s*false|no (?:numeric |numerical )?contradiction|not a contradiction|is (?:arithmetically )?consistent|consistent with the vignette|matches the vignette|on reflection|re-?exam|re-?read|re-?check|re-?evaluat|retract|there is no actual conflict|correctly applies|actually agrees?\b/i.test(
          v.why ?? ""
        )
      ) {
        continue;
      }
      /* Both halves have to exist where they were said to be. */
      if (!stem.includes(first.slice(0, 40))) continue;
      const where = v.fault === "vignette" ? stem : working;
      if (!where.includes(second.slice(0, 40))) continue;
      flagged.push({ ...v, status: row.status, format: row.format });
    }
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  batch at ${i}: ${(e as Error).message}`);
  }
  done += batch.length;
  if (done % 100 === 0) console.error(`  ${done}/${work.length} …`);
}

console.log(
  `${work.length} question(s) read; ${flagged.length} whose numbers disagree\n`
);
for (const f of flagged.sort((a, b) => a.id - b.id)) {
  console.log(`#${f.id} (${f.status}, ${f.format}) ${f.fault}: ${f.why ?? ""}`);
  console.log(`   vignette: "${(f.stemQuote ?? "").trim().slice(0, 150)}"`);
  console.log(`   against:  "${(f.otherQuote ?? "").trim().slice(0, 150)}"`);
}
if (failed) console.log(`\n${failed} batch(es) could not be read`);
