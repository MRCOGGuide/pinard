/**
 * Stems that put a question in a patient's mouth that no patient asks.
 *
 *   npx tsx scripts/audit-patient-voice.mts
 *
 * #1529 ended "she asks what proportion of circulating testosterone in
 * premenopausal women is biologically active — that is, unbound to any
 * plasma protein". A consultant might ask a trainee that; a woman in a
 * menopause clinic asks whether testosterone will help her. The fact
 * was worth testing and the vignette was sound — only the voice was
 * wrong, and a vignette that does not sound like a clinic is one a
 * candidate stops believing.
 *
 * Patients do ask about numbers: how likely it is to work, how often it
 * comes back, what the chances are for their baby. What they do not ask
 * is for service statistics, laboratory thresholds, screening
 * performance, study methodology, or a mechanism in its technical
 * vocabulary. That line is a judgement, so the model draws it and a
 * reviewer reads the result.
 *
 * Batched, because the judgement needs no more than the stem.
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

type Row = { id: number; status: string; stem: string };

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, stem")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

/* Only stems where somebody asks something are worth a reading. */
const ASKING =
  /\b(asks|asked|enquires|inquires|queries|wants to know|would like to know|is keen to know|seeks (?:advice|clarification))\b/i;
let candidates = rows.filter((r) => ASKING.test(r.stem ?? ""));
/* "only:1529,164,..." reads just those, for calibrating the criterion. */
const only = process.argv.find((a) => a.startsWith("only:"));
if (only) {
  const ids = new Set(only.slice(5).split(",").map(Number));
  candidates = rows.filter((r) => ids.has(r.id));
}

const SYSTEM = `You review clinical vignettes for the MRCOG Part 2, sat by UK obstetrics and gynaecology trainees.

For each stem, do exactly this:

1. Find the clause where somebody is described as asking, and COPY IT VERBATIM.
2. Say who is asking: patient, relative, or clinician (trainee, registrar, consultant, midwife, sonographer, pathologist, student).
3. Judge ONLY the words you copied. Would a patient, in a clinic, put a question that way?

Judge the words asked, NOT the knowledge needed to answer them. The answer may involve a guideline figure, a mechanism, a study — that is the exam's business and is never a reason to flag. A patient asking "how likely is this to work?" is fine even if the answer is a relative risk from a trial.

Flag ONLY when the copied clause is itself implausible in a patient's mouth — when the patient is made to ask for:
  - a statistic about a population that is not them ("what proportion of women referred to tertiary centres…", "how many invasive tests are avoided nationally");
  - a laboratory or protocol threshold ("what minimum fetal DNA percentage is required before a result can be generated");
  - screening or test performance in technical terms (false positive rate, sensitivity, specificity, detection rate);
  - where a figure was published, or how a study was done;
  - a mechanism in technical vocabulary ("what proportion of circulating testosterone is unbound to plasma protein").

These are NOT flags — they are ordinary things patients say:
  "She asks about weight gain." "She asks where the procedure should be performed." "She asks about her bone mineral density." "She asks whether her periods will stop." "She asks how likely the treatment is to work." "She asks about the risk of emergency hysterectomy with each mode of birth." "She asks whether her pain pattern suggests endometriosis." "She asks what proportion of women in her situation develop the problem."

NEVER flag a stem whose asker is a clinician, however technical the question. If you find yourself writing that the asker is a trainee, the answer is flag: false.
If no one is quoted asking anything, flag: false.

Reply with JSON only:
{"stems":[{"id":<id>,"asked":"<the clause copied verbatim, or empty>","asker":"<patient|relative|clinician|none>","flag":true|false,"why":"<one short clause, only when flag is true>"}]}`;

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
  asker?: string;
  asked?: string;
  why?: string;
};

const BATCH = 8;
const flagged: (Verdict & { status: string; stem: string })[] = [];
let done = 0;
let failed = 0;

for (let i = 0; i < candidates.length; i += BATCH) {
  const batch = candidates.slice(i, i + BATCH);
  const body = batch
    .map((r) => `--- id ${r.id} ---\n${r.stem}`)
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
      // It sometimes flags while naming a clinician as the asker; the
      // asker it identified is the more reliable half of that answer.
      if (!v.flag || v.asker === "clinician" || v.asker === "none") continue;
      const row = batch.find((r) => r.id === v.id);
      if (row) flagged.push({ ...v, status: row.status, stem: row.stem });
    }
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  batch at ${i}: ${(e as Error).message}`);
  }
  done += batch.length;
  if (done % 80 === 0) console.error(`  ${done}/${candidates.length} …`);
}

console.log(
  `${candidates.length} stem(s) quote someone asking; ${flagged.length} put the question in a patient's mouth\n`
);
for (const f of flagged.sort((a, b) => a.id - b.id)) {
  console.log(`#${f.id} (${f.status}, ${f.asker ?? "?"}) ${f.why ?? ""}`);
  console.log(`   asked: ${(f.asked ?? "").trim().slice(0, 200)}`);
}
if (failed) console.log(`\n${failed} batch(es) could not be read`);
