/**
 * EMQ sets whose option list does not give a scenario real alternatives.
 *
 *   npx tsx scripts/audit-distractors.mts            # every set
 *   npx tsx scripts/audit-distractors.mts 20         # the first 20 sets
 *
 * An EMQ is answered from a shared list, and the list is what makes it
 * hard. Set #1489 asked which contraceptive was safe after a myocardial
 * infarction from a list of cardiac investigations containing exactly
 * two contraceptives, one of them famously contraindicated — a candidate
 * who knows no cardiology answers it by spotting which options are the
 * right kind of thing. The knowledge is never tested.
 *
 * So: for each scenario, how many options are both the same kind of
 * answer and clinically arguable for that stem? Fewer than three and the
 * question is decided by category rather than by reasoning.
 *
 * The judgement is the model's and the verdict is a reviewer's; this
 * prints what to read.
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
  lead_in: string | null;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  emq_group_id: string | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, correct_key, options, emq_group_id")
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

const all = [...sets.values()];
const arg = process.argv[2];
/* "set:1489" reads the one set that question belongs to. */
const work = arg?.startsWith("set:")
  ? all.filter((s) => s.some((r) => r.id === Number(arg.slice(4))))
  : Number.isFinite(Number(arg))
    ? all.slice(0, Number(arg))
    : all;

const SYSTEM = `You review extended matching questions for the MRCOG Part 2, sat by UK obstetrics and gynaecology trainees at ST5 level.

An EMQ presents one option list and several clinical scenarios answered from it. The list is what makes the question hard: a candidate should have to choose between options that are all the same kind of answer and all clinically arguable, and be separated only by knowing the case.

For each scenario, count the options that are BOTH:
  - the same kind of answer as the marked one (all investigations, all drugs, all contraceptive methods, all risk figures), AND
  - arguable for that scenario — an option a reasonable trainee could seriously consider before ruling out.

The count includes the marked answer itself. An option of a different kind, or one no trainee would weigh, does not count.

Reply with JSON only:
{"scenarios":[{"id":<question id>,"plausible":<count>,"kinds":"<the kinds of thing in the list, e.g. 'investigations (8), contraceptives (2)'>","note":"<one short clause, only if plausible < 3>"}]}`;

function render(set: Row[]): string {
  const first = set[0];
  const options = (first.options ?? [])
    .map((o) => `${o.key}. ${o.text}`)
    .join("\n");
  const scenarios = set
    .map(
      (s) =>
        `Question id ${s.id} (answer ${s.correct_key}):\n${s.stem}`
    )
    .join("\n\n");
  return `LEAD-IN: ${first.lead_in ?? "(none)"}\n\nOPTIONS:\n${options}\n\nSCENARIOS:\n${scenarios}`;
}

type Verdict = {
  id: number;
  plausible: number;
  kinds?: string;
  note?: string;
};

const flagged: { set: Row[]; verdicts: Verdict[] }[] = [];
let done = 0;
let failed = 0;

for (const set of work) {
  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 900,
      system: SYSTEM,
      messages: [{ role: "user", content: render(set) }],
    });
    const text = reply.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { scenarios: Verdict[] };
    const bad = (parsed.scenarios ?? []).filter((v) => v.plausible < 3);
    if (bad.length) flagged.push({ set, verdicts: parsed.scenarios });
  } catch {
    failed++;
  }
  done++;
  if (done % 25 === 0) console.error(`  ${done}/${work.length} …`);
}

console.log(`${flagged.length} of ${work.length} EMQ sets have a scenario with fewer than three arguable options\n`);
for (const { set, verdicts } of flagged) {
  const first = set[0];
  const bad = verdicts.filter((v) => v.plausible < 3);
  console.log(
    `set #${first.id} (${set.length} scenarios, ${(first.options ?? []).length} options, ${set[0].status})`
  );
  console.log(`  list: ${bad[0]?.kinds ?? verdicts[0]?.kinds ?? "?"}`);
  for (const v of bad) {
    console.log(`  #${v.id}: ${v.plausible} arguable — ${v.note ?? ""}`);
  }
}
if (failed) console.log(`\n${failed} set(s) could not be read`);
