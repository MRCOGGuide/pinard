/**
 * Findings the vignette gives no time to develop.
 *
 *   npx tsx scripts/audit-finding-timing.mts
 *   npx tsx scripts/audit-finding-timing.mts 120
 *   npx tsx scripts/audit-finding-timing.mts only:1682
 *
 * #1682 decompensated during Veress needle insertion and the
 * laparoscope then found "a retroperitoneal haematoma seen enlarging
 * near the sacral promontory". Every finding in it came from the
 * guidance's own list of how vascular injury is recognised, so the
 * grounding check passed it; a list of signs is not a timeline, and
 * the one it used takes minutes the vignette had not spent.
 *
 * This is not the timing audit, which catches an answer anchored to a
 * moment the stem has passed, nor the coherence audit, which weighs
 * the vignette against its answer. Here the question is narrower: has
 * the clock in the vignette run long enough for what it describes —
 * a haematoma, an effusion, an ecchymosis, a rise in a marker, a
 * cultured organism, a healed or organised change.
 *
 * Only the stem is read. What the answer is does not bear on whether
 * a bruise has had time to appear.
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

type Row = { id: number; status: string; format: string; stem: string };

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, stem")
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

const SYSTEM = `You are checking the clock inside clinical vignettes written for the MRCOG Part 2.

Decide ONE thing per vignette: does it describe a finding that could not have developed in the time the vignette itself allows?

The fault looks like this. A woman decompensates during Veress needle insertion — seconds into the operation — and the laparoscope immediately shows "a retroperitoneal haematoma seen enlarging". A haematoma large enough to watch grow is not there yet. Or an abdominal wall ecchymosis minutes after an injury; an organised collection hours after a perforation; a positive culture an hour after the swab; a CRP rise within minutes; a healed or organised change days too early; a drug effect quoted before it could be reached.

You need TWO things from the vignette to flag it: the moment it happens, and the finding. Copy both, verbatim.

These are NOT faults:
  - a finding present from the start rather than caused by the event: a woman who already had a cyst, an old scar, a chronic hydronephrosis;
  - something that genuinely is immediate — free blood, active bleeding, a fall in blood pressure, pain, a desaturation, gas under the diaphragm, a palpable mass that was always there;
  - a vignette that does not say when. If no interval is given, you cannot say the interval was too short; do not infer one;
  - a number you would argue with. Borderline is not impossible;
  - an estimate or a range: "within an hour", "shortly after", "some hours later";
  - anything about the answer. You are not judging management.

Be strict: flag only where a clinician reading it would say "that would not be there yet". If you find yourself writing "might", "could arguably" or "depending on", the answer is flag: false.

Reply with JSON only:
{"stems":[{"id":<id>,"flag":true|false,"when":"<the moment, copied verbatim>","finding":"<the finding, copied verbatim>","why":"<one short clause>"}]}`;

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
  when?: string;
  finding?: string;
  why?: string;
};

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

const BATCH = 6;
const flagged: (Verdict & { status: string; format: string })[] = [];
let done = 0;
let failed = 0;

for (let i = 0; i < work.length; i += BATCH) {
  const batch = work.slice(i, i + BATCH);
  const body = batch.map((r) => `--- id ${r.id} ---\n${r.stem}`).join("\n\n");
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
    const parsed = JSON.parse(json) as { stems: Verdict[] };
    for (const v of parsed.stems ?? []) {
      if (!v.flag) continue;
      const row = batch.find((r) => r.id === v.id);
      if (!row) continue;
      const stem = tidy(row.stem);
      const when = tidy(v.when ?? "");
      const finding = tidy(v.finding ?? "");
      /* Both halves have to be in the vignette, or it wrote them. */
      if (when.length < 6 || finding.length < 6) continue;
      if (!stem.includes(when.slice(0, 30))) continue;
      if (!stem.includes(finding.slice(0, 30))) continue;
      /* And it retracts in the margin, as every one of these audits finds. */
      if (
        /\bflag:\s*false|on reflection|re-?check|re-?exam|re-?read|re-?evaluat|retract|not (?:a |an )?(?:true |real )?(?:fault|contradiction|impossibility)|is (?:plausible|reasonable|possible)|no (?:actual )?(?:conflict|fault)\b/i.test(
          v.why ?? ""
        )
      ) {
        continue;
      }
      flagged.push({ ...v, status: row.status, format: row.format });
    }
  } catch (e) {
    failed++;
    if (failed <= 3) console.error(`  batch at ${i}: ${(e as Error).message}`);
  }
  done += batch.length;
  if (done % 120 === 0) console.error(`  ${done}/${work.length} …`);
}

console.log(
  `${work.length} stem(s) read; ${flagged.length} describe a finding that has had no time to appear\n`
);
for (const f of flagged.sort((a, b) => a.id - b.id)) {
  console.log(`#${f.id} (${f.status}, ${f.format}) ${f.why ?? ""}`);
  console.log(`   when:    "${(f.when ?? "").trim().slice(0, 120)}"`);
  console.log(`   finding: "${(f.finding ?? "").trim().slice(0, 120)}"`);
}
if (failed) console.log(`\n${failed} batch(es) could not be read`);
