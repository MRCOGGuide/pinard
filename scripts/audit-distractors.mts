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
 * So: does the scenario's closing sentence name a category — "which
 * contraceptive method", "what duration", "at what gestation" — and if
 * it does, how many options belong to it? Set #143 asks for the duration
 * of tocolysis from a list holding exactly one duration.
 *
 * Counting arguable options instead was the first attempt, and it
 * flagged two thirds of the bank: in a sound set most scenarios have
 * only two arguable options, because the list serves every scenario and
 * not one of them. What matters is not how many answers are defensible
 * but how many the candidate cannot rule out before reading the case.
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

An EMQ presents one option list and several clinical scenarios answered from it. A candidate must not be able to shortcut a scenario by noticing which options are the right KIND of thing. If a scenario asks for a contraceptive method and only two options are contraceptives, the candidate is down to two without any clinical knowledge, whatever else the list contains.

Work from the scenario's FINAL question sentence, and only from it.

1. Does that sentence name a category of answer? "Which contraceptive method…" names one. "Which investigation…", "Which drug…", "At what gestation…" name one. "What is the most appropriate management option / next step / plan?" does NOT — it admits anything in the list.

2. If it names no category, set sameKind to the number of options in the list. There is nothing to shortcut.

3. If it names a category, count the options that belong to it. Count by what the option IS, not by whether it suits this case: a plainly wrong option of the named category is a working distractor and counts. Read an option as a whole — "Tocolysis for 48 hours" is a treatment, not a duration; "Planned birth at 36+1 to 37+0 weeks" is a plan of care, not a gestation. Never sub-type within the named category: two antibiotics, two imaging tests, two operations are each one category.

The count includes the marked answer itself. A low count means the list hands the candidate the answer by category.

Reply with JSON only:
{"scenarios":[{"id":<question id>,"kind":"<the category the question sentence names, or 'none'>","sameKind":<count>}],"kinds":"<the kinds in the list with counts, at most twelve words, e.g. 'investigations (8), contraceptives (2)'>"}`;

/**
 * The first complete JSON object in a reply.
 *
 * Slicing from the first brace to the last one joins two objects
 * together when the model adds a second thought after the answer, and
 * the parse then fails on a reply that was perfectly usable.
 */
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

type Verdict = { id: number; kind?: string; sameKind: number };

const results: { set: Row[]; verdicts: Verdict[]; kinds: string }[] = [];
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
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as { scenarios: Verdict[]; kinds?: string };
    results.push({
      set,
      verdicts: parsed.scenarios ?? [],
      kinds: parsed.kinds ?? "",
    });
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  set #${set[0].id}: ${(e as Error).message}`);
  }
  done++;
  if (done % 25 === 0) console.error(`  ${done}/${work.length} …`);
}

/*
  The distribution first. "Fewer than N of the answer's kind" is only
  meaningful against what a sound set looks like, and guessing the
  threshold up front is how the first run of this flagged two thirds of
  the bank as broken.
*/
const spread = new Map<number, number>();
for (const { verdicts } of results) {
  for (const v of verdicts) spread.set(v.sameKind, (spread.get(v.sameKind) ?? 0) + 1);
}
/* Keep the readings, so a different threshold costs no model calls. */
const dump = process.env.AUDIT_DUMP;
if (dump) {
  fs.writeFileSync(
    dump,
    JSON.stringify(
      results.map((r) => ({
        setId: r.set[0].id,
        status: r.set[0].status,
        options: (r.set[0].options ?? []).length,
        scenarios: r.set.length,
        kinds: r.kinds,
        verdicts: r.verdicts,
      })),
      null,
      1
    )
  );
  console.error(`readings written to ${dump}`);
}

console.log(`${results.length} sets read, ${failed} unreadable\n`);
console.log("options of the answer's own kind, per scenario:");
for (const [n, count] of [...spread.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${String(n).padStart(2)}  ${"█".repeat(Math.ceil(count / 8))} ${count}`);
}

/*
  Two, not three. Three options of the named category is an ordinary
  exam choice — a candidate who has narrowed to three still has to know
  the case. At two the category alone has made it a coin flip, which is
  the fault #1489 and #144 were: two contraceptives in a list of
  investigations, one duration in a list of management steps.
*/
const THRESHOLD = 2;
const flagged = results
  .map((r) => ({ ...r, bad: r.verdicts.filter((v) => v.sameKind <= THRESHOLD) }))
  .filter((r) => r.bad.length > 0)
  .sort((a, b) => Math.min(...a.bad.map((v) => v.sameKind)) - Math.min(...b.bad.map((v) => v.sameKind)));

console.log(
  `\n${flagged.length} set(s) where a scenario has ${THRESHOLD} or fewer options of its answer's kind\n`
);
for (const { set, kinds, bad } of flagged) {
  const first = set[0];
  console.log(
    `set #${first.id} (${set.length} scenarios, ${(first.options ?? []).length} options, ${first.status})`
  );
  console.log(`  list: ${kinds}`);
  for (const v of bad) {
    console.log(`  #${v.id}: ${v.sameKind} of kind "${v.kind ?? "?"}"`);
  }
}
