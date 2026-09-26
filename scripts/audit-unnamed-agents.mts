/**
 * Explanations that name a drug CLASS where the guidance names a DRUG.
 *
 *   npx tsx scripts/audit-unnamed-agents.mts
 *   npx tsx scripts/audit-unnamed-agents.mts only:1561
 *
 * #1561 told a candidate that transplacental antiarrhythmic therapy
 * converts around 90% of non-hydropic fetal tachycardias, and never
 * said what the drug is. The figure is the answer, but the drug is what
 * the registrar prescribes on Monday, and the source names it three
 * sentences later: digoxin, flecainide, sotalol.
 *
 * So this is a teaching audit, not a correctness one. Nothing it finds
 * is wrong; each one is a card that could carry one more fact at no
 * cost, in brackets, without touching what is being tested.
 *
 * Read only the explanation here — whether the guidance names an agent
 * is the repair's question, and it needs the passages to answer it.
 *
 * Prefiltered on a list of class words, because an explanation with no
 * class word in it has nothing to name.
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
const { DRUG_CLASS } = await import("./drug-classes.mts");

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

type Candidate = Row & { working: string };
let candidates: Candidate[] = [];
for (const r of rows) {
  const working = (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "";
  if (!working || !DRUG_CLASS.test(working)) continue;
  candidates.push({ ...r, working });
}

const only = process.argv.find((a) => a.startsWith("only:"));
if (only) {
  const ids = new Set(only.slice(5).split(",").map(Number));
  candidates = rows
    .map((r) => ({
      ...r,
      working: (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "",
    }))
    .filter((r) => ids.has(r.id));
}

console.error(`${candidates.length} explanation(s) mention a drug class`);

const SYSTEM = `You review the explanation printed under an answered MRCOG Part 2 question, written for a UK registrar.

Decide ONE thing: does the explanation refer to the treatment of the problem in the question BY CLASS ALONE, where a candidate would be better taught if the drug the guidance uses were named in brackets?

Flag when the explanation says what kind of drug and never which drug: "transplacental antiarrhythmic therapy", "she should be offered thromboprophylaxis", "first-line antibiotics", "a tocolytic should be given", "adjuvant chemotherapy". A registrar has to write a prescription; the class is not a prescription.

Do NOT flag:
  - an explanation that already names a drug for that class anywhere in it, in brackets or in prose. One naming is enough — "antibiotics (co-amoxiclav)" is done, and so is "antibiotics … co-amoxiclav is first line";
  - a class word used to describe what a preparation CONTAINS or how it works, rather than a choice of drug: "the combined pill contains oestrogen and progestogen", "the oestrogen component drives the VTE risk", "progestogen opposes endometrial proliferation". There is no drug to name — the class IS the fact;
  - a class mentioned as this woman's background or as a risk factor, not as the treatment being explained: "she is already on antihypertensives", "long-term steroid use";
  - a class named only to be ruled out: "antibiotics are not indicated";
  - a class where the whole class is the point and any member would do, and the question turns on the class: "any combined hormonal contraceptive", "a bisphosphonate" where the answer is the class itself;
  - where naming a drug would give away or contradict an option in the question.

Copy the class phrase EXACTLY as it appears, and copy the shortest phrase that occurs only ONCE in the explanation — if "antibiotics" appears twice, quote the longer phrase around the first one.

Reply with JSON only:
{"cards":[{"id":<id>,"flag":true|false,"anchor":"<the class phrase copied verbatim, only when flag is true>","why":"<one short clause, only when flag is true>"}]}`;

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

type Verdict = { id: number; flag: boolean; anchor?: string; why?: string };

const BATCH = 6;
const flagged: (Verdict & { status: string; format: string; working: string })[] = [];
let done = 0;
let failed = 0;

for (let i = 0; i < candidates.length; i += BATCH) {
  const batch = candidates.slice(i, i + BATCH);
  const body = batch
    .map((r) =>
      [
        `--- id ${r.id} ---`,
        `QUESTION: ${r.stem.slice(0, 400)}`,
        `ANSWER: ${(r.options ?? []).find((o) => o.key === r.correct_key)?.text ?? "?"}`,
        `EXPLANATION: ${r.working}`,
      ].join("\n")
    )
    .join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 1400,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { cards: Verdict[] };
    for (const v of parsed.cards ?? []) {
      if (!v.flag || !v.anchor?.trim()) continue;
      const row = batch.find((r) => r.id === v.id);
      if (!row) continue;
      /*
        The anchor is where the repair will splice, so it has to be
        findable and unambiguous. Asked for a phrase that occurs once;
        checked here, because a phrase that occurs twice would have the
        bracket land on whichever came first.
      */
      const anchor = v.anchor.trim();
      const occurrences = row.working.split(anchor).length - 1;
      if (occurrences !== 1) continue;
      flagged.push({ ...v, anchor, status: row.status, format: row.format, working: row.working });
    }
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  batch at ${i}: ${(e as Error).message}`);
  }
  done += batch.length;
  if (done % 60 === 0) console.error(`  ${done}/${candidates.length} …`);
}

console.log(
  `${candidates.length} explanation(s) read; ${flagged.length} name a class where a drug could be named\n`
);
for (const f of flagged.sort((a, b) => a.id - b.id)) {
  console.log(`#${f.id} (${f.status}, ${f.format}) ${f.why ?? ""}`);
  console.log(`   anchor: ${f.anchor}`);
}
if (failed) console.log(`\n${failed} batch(es) could not be read`);
