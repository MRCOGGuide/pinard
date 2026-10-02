/**
 * Answers with nothing standing near them.
 *
 *   npx tsx scripts/audit-near-distractors.mts --pending
 *   npx tsx scripts/audit-near-distractors.mts set:1849
 *
 * The category audit asks whether the list is full of the KIND of thing
 * the question asks for. This asks the narrower question that #1849
 * failed: how many options are the ANSWER with one thing changed.
 *
 * #1849's answer was intravenous benzylpenicillin once labour is
 * established. The list offered one other antibiotic decision, "withhold
 * prophylaxis", and then tocolytics, magnesium and counselling figures.
 * A candidate was down to two without knowing any medicine. The repair
 * was benzylpenicillin on rupture of membranes, benzylpenicillin if
 * chorioamnionitis is suspected, co-amoxiclav, clindamycin, and the
 * oral erythromycin that answers the neighbouring question: five
 * options that differ from the answer in one respect each.
 *
 * Counted per scenario, because one scenario in a set can be well
 * served while another is not.
 *
 * Read one run as a worklist, not as a measurement. Two runs over the
 * same 390 sets returned 30 flags and then 12, with almost no overlap:
 * the repairs held, and none of the 25 widened scenarios came back, but
 * the borderline cases move between runs. Where both runs agree, look;
 * where one does, read before repairing. The two that agreed turned out
 * to be sound on reading: a list of ten percentages where the answer is
 * the only one above 100%, and a list of pre-ART operations where only
 * one treats a septum, which is the question rather than a flaw.
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
  stem: string;
  lead_in: string | null;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  emq_group_id: string | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, stem, lead_in, correct_key, options, emq_group_id")
    .eq("format", "emq")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const sets = new Map<string, Row[]>();
for (const r of rows) {
  if (!r.emq_group_id) continue;
  const list = sets.get(r.emq_group_id);
  if (list) list.push(r);
  else sets.set(r.emq_group_id, [r]);
}

let work = [...sets.values()];
const only = process.argv.find((a) => a.startsWith("set:"));
if (only) {
  const id = Number(only.slice(4));
  work = work.filter((s) => s.some((r) => r.id === id));
} else if (process.argv.includes("--pending")) {
  work = work.filter((s) => s.every((r) => r.status === "pending"));
}
console.error(`${work.length} set(s) to read`);

const SYSTEM = `You are judging how hard an extended matching question is to answer by elimination.

For each scenario you are given the shared option list and which option is correct.

Count, for each scenario, how many options a candidate could seriously weigh against the correct one. An option counts when it is the correct answer with ONE thing changed, or a real alternative of the same kind:
  - the same intervention with a different drug, dose, route, timing or trigger;
  - a different intervention that a reasonable candidate might choose for this scenario;
  - the opposite decision, where the question is whether to act at all.

An option does NOT count when it belongs to another subject: a tocolytic in a question about antibiotics, a counselling figure in a question about resuscitation, an imaging test in a question about a drug. Those narrow the list for free.

Count the correct option itself, so the smallest possible answer is 1. Return 1 only where NOTHING else in the list could be weighed against it, 2 where one other option could, and so on.

Reply with JSON only:
{"scenarios":[{"id":<id>,"near":<count>,"why":"<at most twelve words naming what the near options are>"}]}`;

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

type Verdict = { id: number; near: number; why?: string };

/*
  One, not two. At two this flagged 44 of 55 pending sets, and reading
  them showed why: a scenario whose answer has two real alternatives
  beside it is a working question, and the model's own note kept naming
  three options while returning the count of the other two. What is
  worth repairing is the answer that stands alone.
*/
const THIN = 1;
const flagged: { set: Row[]; thin: Verdict[] }[] = [];
let failed = 0;

for (const set of work) {
  const first = set[0];
  const options = (first.options ?? []).map((o) => `${o.key}. ${o.text}`).join("\n");
  const body = [
    `LEAD-IN: ${first.lead_in ?? ""}`,
    `OPTIONS:\n${options}`,
    ...set.map((s) => `SCENARIO id ${s.id} (correct answer ${s.correct_key}):\n${s.stem}`),
  ].join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { scenarios: Verdict[] };
    const thin = (parsed.scenarios ?? []).filter(
      (v) => Number.isFinite(v.near) && v.near <= THIN && set.some((r) => r.id === v.id)
    );
    if (thin.length) flagged.push({ set, thin });
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  set at ${first.id}: ${(e as Error).message}`);
  }
}

console.log(
  `${work.length} set(s) read; ${flagged.length} have a scenario with ${THIN} or fewer options worth weighing\n`
);
for (const { set, thin } of flagged) {
  const first = set[0];
  console.log(`set #${first.id} (${set.length} scenarios, ${(first.options ?? []).length} options, ${first.status})`);
  for (const v of thin) {
    console.log(`  #${v.id}: ${v.near} near option(s) — ${v.why ?? ""}`);
    const row = set.find((r) => r.id === v.id);
    const answer = (row?.options ?? []).find((o) => o.key === row?.correct_key)?.text ?? "?";
    console.log(`     answer: ${answer.slice(0, 110)}`);
  }
}
if (failed) console.log(`\n${failed} set(s) could not be read`);
