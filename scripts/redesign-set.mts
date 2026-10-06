/**
 * Redesign an EMQ set's shared option list, with its scenarios, at once.
 *
 *   npx tsx scripts/redesign-set.mts 2052            propose, change nothing
 *   npx tsx scripts/redesign-set.mts 2052 --apply    write the saved proposal
 *
 * (Any scenario id in the set will do.)
 *
 * Why a separate tool. repair-queue repairs one scenario and may only
 * reword options in place, which is right for a scenario with a fault of
 * its own and useless for a fault that belongs to the list. The 2052 set
 * had that kind: an option list mixing an interpretation, a method, a
 * policy and several actions, and one option carrying the word "COVID",
 * so that each scenario could be answered by spotting the only option of
 * its shape or its subject. The reviewer put it as "no adequate
 * distractors". The list has to be rebuilt with every scenario in view,
 * and a scenario whose answer changes kind has to change with it.
 *
 * Grounded on the passages the scenarios cite, plus the passages from
 * the same documents that bear on the same subject, so distractors are
 * drawn from what the guidance says is done in neighbouring situations
 * rather than invented.
 *
 * Proposals are saved and --apply writes exactly what was read, after
 * checking every row still holds the text, answer, explanation and
 * status the proposal was made from.
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
const { PROMPT_G, PROMPT_L } = await import("../src/lib/prompts");
const g = await import("../src/lib/generation");

/**
 * The reviewer's notes, per scenario, in their words where they gave
 * them. Keyed by scenario id.
 */
const NOTES: Record<number, string> = {
  2052:
    "The stem says she was booked at 12 weeks, which has nothing to do with the question. Remove details that play no part in the answer. Keep the teaching point: a high-risk woman with an abnormal uterine artery Doppler at the anomaly scan has serial ultrasound for fetal biometry from 24+0 to 28+6 weeks.",
  2053:
    "The stem says the sonographer measures HC, AC and FL and then that HC cannot be obtained: was HC measured or not? It contradicts itself. And the options give it no adequate distractors: its answer is the only interpretation in a list of actions. Rewrite it as a management question with an action as the answer, about estimating fetal weight when the head circumference cannot be measured, keeping the teaching point that EFW from AC and FL is used and the change of formula is accounted for when comparing with earlier estimates.",
  /*
    Second note. The first run took COVID out of the stem as well as the
    option, and the explanation then asserted the 14-day rule for any
    serious illness, which the guidance says of COVID-19 only. The
    giveaway was the word in the OPTION; the stem keeps it.
  */
  2054:
    "The only suitable answer in the options is the correct one: there are no appropriate distractors, and the answer is the only option mentioning COVID-19, which gives it away. Keep the teaching point exactly as the guidance gives it: after being seriously or critically unwell WITH COVID-19, a woman is offered an ultrasound scan for fetal biometry within 14 days of recovery. The STEM must still say she was seriously unwell with COVID-19, because the recommendation is specific to COVID-19 and must not be generalised to other illnesses. It is the OPTIONS that must not mention COVID: the correct option reads as a timing of biometry, like the others.",
};

/**
 * Scenarios to leave out of the redesign, because they are leaving the
 * set: detach-to-sba moves them out first, and the apply step refuses
 * if the set's membership is not what the proposal saw.
 */
const LEAVING = new Set<number>(
  (process.argv.slice(2).find((a) => a.startsWith("--without="))?.slice("--without=".length) ?? "")
    .split(",")
    .filter(Boolean)
    .map(Number)
);

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const anchorId = Number(args.find((a) => /^\d+$/.test(a)));
if (!anchorId) {
  console.log("usage: npx tsx scripts/redesign-set.mts <scenario id> [--apply]");
  process.exit(1);
}

const db = createAdminClient();
const PROPOSALS_FILE = ".review/set-proposals.json";

type Explanation = {
  key: string;
  verdict?: string;
  text: string;
  citation_chunk_ids?: number[];
  source_reference?: string;
};
type Row = {
  id: number;
  status: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: Explanation[] | null;
  citation_chunk_ids: number[] | null;
  emq_group_id: string | null;
};
type SetProposal = {
  group: string;
  before: Record<number, Pick<Row, "stem" | "correct_key" | "explanations" | "status" | "options" | "lead_in">>;
  lead_in: string;
  options: { key: string; text: string }[];
  scenarios: Record<
    number,
    { stem: string; correct_key: string; explanations: Explanation[]; citation_chunk_ids: number[] }
  >;
};

const COLUMNS =
  "id, status, stem, lead_in, options, correct_key, explanations, citation_chunk_ids, emq_group_id";

const { data: anchor } = await db
  .from("generated_questions")
  .select(COLUMNS)
  .eq("id", anchorId)
  .single();
const group = (anchor as Row | null)?.emq_group_id;
if (!group) {
  console.log(`Q${anchorId} is not part of an EMQ set`);
  process.exit(1);
}

/* ---------------------------------------------------------------- */
/*  Apply                                                            */
/* ---------------------------------------------------------------- */

if (apply) {
  const saved: SetProposal[] = fs.existsSync(PROPOSALS_FILE)
    ? JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf8"))
    : [];
  const p = saved.find((x) => x.group === group);
  if (!p) {
    console.log("no saved proposal for this set: propose it first");
    process.exit(1);
  }
  const { data } = await db.from("generated_questions").select(COLUMNS).eq("emq_group_id", group);
  const rows = (data ?? []) as Row[];

  /* Every row first, writes second: one row changed under the proposal
     means none of the set is written, because a set half on the new
     list and half on the old is worse than either. */
  for (const r of rows) {
    const b = p.before[r.id];
    const reason = !b
      ? "a scenario not in the proposal"
      : r.status !== b.status
        ? `status is now ${r.status}`
        : r.stem !== b.stem
          ? "stem edited"
          : r.correct_key !== b.correct_key
            ? "answer changed"
            : JSON.stringify(r.explanations) !== JSON.stringify(b.explanations)
              ? "explanation edited"
              : JSON.stringify(r.options) !== JSON.stringify(b.options)
                ? "options edited"
                : null;
    if (reason) {
      console.log(`Q${r.id}: ${reason} since the proposal was made. Nothing written.`);
      process.exit(1);
    }
  }

  for (const r of rows) {
    const s = p.scenarios[r.id];
    const { error } = await db
      .from("generated_questions")
      .update({
        lead_in: p.lead_in,
        options: p.options,
        stem: s.stem,
        correct_key: s.correct_key,
        explanations: s.explanations,
        citation_chunk_ids: s.citation_chunk_ids,
      })
      .eq("id", r.id);
    console.log(error ? `Q${r.id} WRITE FAILED: ${error.message}` : `Q${r.id} applied`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/*  Propose                                                          */
/* ---------------------------------------------------------------- */

const { data: setRows } = await db
  .from("generated_questions")
  .select(COLUMNS)
  .eq("emq_group_id", group)
  .order("id");
const rows = ((setRows ?? []) as Row[]).filter((r) => !LEAVING.has(r.id));
if (LEAVING.size) console.log(`leaving out Q${Array.from(LEAVING).join(", Q")}, which is leaving the set`);
console.log(`set ${group}: Q${rows.map((r) => r.id).join(", Q")}\n`);

/* The cited passages, then the same documents' passages on the same
   subject, so distractors come from what the guidance says is done in
   neighbouring situations. */
const cited = new Set<number>();
for (const r of rows) {
  for (const c of r.citation_chunk_ids ?? []) cited.add(c);
  for (const e of r.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) cited.add(c);
}
const { data: citedRows } = await db
  .from("content_chunks")
  .select("id, document_id, text")
  .in("id", Array.from(cited));
const docs = Array.from(new Set(((citedRows ?? []) as { document_id: number }[]).map((c) => c.document_id)));
const { data: sameDoc } = await db
  .from("content_chunks")
  .select("id, text")
  .in("document_id", docs);
const subject = /(biometry|Doppler|EFW|estimated fetal weight|SFH|symphysis|serial|surveillance|growth)/i;
const neighbours = ((sameDoc ?? []) as { id: number; text: string }[])
  .filter((c) => !cited.has(c.id) && subject.test(c.text))
  .slice(0, 14);
const passages = [...((citedRows ?? []) as { id: number; text: string }[]), ...neighbours];
const retrieved = new Set(passages.map((c) => c.id));

const current = JSON.stringify(
  {
    lead_in: rows[0].lead_in,
    options: rows[0].options,
    scenarios: rows.map((r) => ({
      id: r.id,
      stem: r.stem,
      correct_key: r.correct_key,
      explanation: (r.explanations ?? []).find((e) => e.key === r.correct_key)?.text ?? "",
      reviewer_note: NOTES[r.id] ?? "No fault named; keep it, adjusting only what the new list requires.",
    })),
  },
  null,
  1
);

const task = `TASK: Redesign ONE EMQ set. A reviewer has found that its shared option list does not give its scenarios adequate distractors.

WHAT A GOOD LIST IS
- One category throughout. Every option is the same kind of thing: here, a fetal surveillance or fetal growth assessment action a clinician could order. No interpretations, no policies, no counselling statements.
- 10 options, keys A to J, alphabetical by text, each a short clinical item of twelve words or fewer.
- Every scenario has at least three options in the list that a candidate who did not know the specific rule could reasonably choose, and that the passages show to be wrong for that scenario or right for a different one.
- No option names a condition, investigation result or word that appears in only one scenario's stem: an option that says "COVID" can only belong to the scenario about COVID, and is answered by matching words rather than knowing medicine.
- Each scenario's correct answer is a different option.

THE SCENARIOS
- Keep each scenario's teaching point. Apply the reviewer's note for each.
- Remove from each stem any detail that plays no part in the answer.
- A stem must not contradict itself, and must not contain its own answer.
- Each scenario's explanation is the correct option's explanation: why it is right, from the passages, and briefly why the most tempting distractor is wrong. 30 to 90 words.

Everything you write must come from the SOURCE PASSAGES. No fact, figure or timing from memory.

OUTPUT: ONLY this JSON, no prose around it.
{"lead_in": "...", "options": [{"key":"A","text":"..."}], "scenarios": [{"id": 2052, "stem": "...", "correct_key": "F", "explanation": "...", "citation_chunk_ids": [1,2]}], "note": "what you changed and why, in two sentences"}`;

const prompt =
  PROMPT_G +
  "\n\n" +
  PROMPT_L +
  "\n\n" +
  task +
  `\n\nTHE SET AS IT STANDS:\n${current}\n\nSOURCE PASSAGES:\n${passages
    .map((c) => `[chunk:${c.id}] ${c.text}`)
    .join("\n\n")}`;

type Out = {
  lead_in: string;
  options: { key: string; text: string }[];
  scenarios: { id: number; stem: string; correct_key: string; explanation: string; citation_chunk_ids: number[] }[];
  note?: string;
};

/* ---------------------------------------------------------------- */
/*  Verify                                                           */
/* ---------------------------------------------------------------- */

const STOP = new Set([
  "the", "and", "with", "for", "from", "that", "this", "her", "she", "weeks", "week",
  "scan", "fetal", "most", "appropriate", "which", "what", "woman", "year", "old",
  "when", "after", "previous", "been", "have",
]);
const words = (t: string) =>
  new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)));

function verify(out: Out): string[] {
const problems: string[] = [];
const ids = new Set(rows.map((r) => r.id));
if (out.scenarios.length !== rows.length || !out.scenarios.every((s) => ids.has(s.id))) {
  problems.push("the scenarios returned are not the scenarios in the set");
}
if (out.options.length < g.EMQ_MIN_OPTIONS || out.options.length > g.EMQ_MAX_OPTIONS) {
  problems.push(`${out.options.length} options, outside ${g.EMQ_MIN_OPTIONS}-${g.EMQ_MAX_OPTIONS}`);
}
problems.push(...g.optionSentenceProblems(out.options));
const answers = out.scenarios.map((s) => s.correct_key);
if (new Set(answers).size !== answers.length) problems.push("two scenarios share an answer");

for (const s of out.scenarios) {
  const opt = out.options.find((o) => o.key === s.correct_key);
  if (!opt) {
    problems.push(`Q${s.id}: correct_key ${s.correct_key} matches no option`);
    continue;
  }
  if (!s.citation_chunk_ids?.length || !s.citation_chunk_ids.every((c) => retrieved.has(c))) {
    problems.push(`Q${s.id}: cites a passage it was not given, or none`);
  }
  const prose = `${s.stem}\n${s.explanation}`;
  for (const f of [
    ...g.ukEnglishProblems(prose),
    ...g.emDashProblems(prose),
    ...g.selfTalkProblems(prose),
    ...g.sourceNarrationProblems(s.explanation),
    ...g.studyAttributionProblems(`${s.stem}\n${out.options.map((o) => o.text).join("\n")}`),
    ...g.listRecallProblems(s.stem),
    ...g.explanationLengthProblems(s.explanation),
    ...g.answerInStemProblems(s.stem, out.options, s.correct_key),
    ...g.ratioInQuestionProblems(`${s.stem}\n${out.options.map((o) => o.text).join("\n")}`),
  ]) {
    problems.push(`Q${s.id}: ${f}`);
  }
  /*
    The tie that gave 2054 away. A content word the stem shares with its
    own answer and with no other option lets a candidate answer by
    matching words. Checked by word so "COVID" is caught however the
    option is phrased.
  */
  const stemWords = words(s.stem);
  const others = out.options.filter((o) => o.key !== s.correct_key).map((o) => words(o.text));
  const ties = Array.from(words(opt.text)).filter(
    (w) => stemWords.has(w) && !others.some((o) => o.has(w))
  );
  if (ties.length) {
    problems.push(`Q${s.id}: its answer is the only option sharing "${ties.join('", "')}" with its stem`);
  }
}
return problems;
}

/*
  Up to three attempts, each told what the last one failed, as in
  detach-to-sba: re-rolling blind trades one failure for another.
*/
const client = claudeClient({ timeout: 240_000 });
let out: Out | null = null;
let problems: string[] = [];
let feedback = "";
for (let attempt = 1; attempt <= 3; attempt++) {
  const response = await client.messages.create({
    model: claudeModel(),
    max_tokens: 5000,
    messages: [{ role: "user", content: prompt + feedback }],
  });
  const raw = response.content.map((b) => ("text" in b ? b.text : "")).join("").trim();
  try {
    out = JSON.parse(g.extractJson(raw)) as Out;
  } catch {
    problems = ["the reply was not parseable JSON"];
    continue;
  }
  problems = verify(out);
  console.log(`attempt ${attempt}: ${problems.length ? `${problems.length} problem(s)` : "passes"}`);
  if (!problems.length) break;
  feedback = `\n\nYOUR PREVIOUS ATTEMPT FAILED THESE CHECKS. Fix every one:\n- ${problems.join("\n- ")}`;
}
if (!out) {
  console.log("no usable reply");
  process.exit(1);
}

/* ---------------------------------------------------------------- */
/*  Show                                                             */
/* ---------------------------------------------------------------- */

console.log(`note: ${out.note ?? ""}\n`);
console.log(`LEAD-IN: ${out.lead_in}\n`);
console.log("OPTIONS:");
for (const o of out.options) {
  const owners = out.scenarios.filter((s) => s.correct_key === o.key).map((s) => `Q${s.id}`);
  console.log(`  ${o.key}. ${o.text}${owners.length ? `   <= ${owners.join(", ")}` : ""}`);
}
for (const s of out.scenarios) {
  const before = rows.find((r) => r.id === s.id)!;
  console.log(`\n--- Q${s.id}  answer ${before.correct_key} -> ${s.correct_key}`);
  console.log(`STEM: ${s.stem}`);
  console.log(`EXPLANATION (${s.explanation.split(/\s+/).length} words): ${s.explanation}`);
}

if (problems.length) {
  console.log(`\nFAILS VERIFICATION, not saved:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const proposal: SetProposal = {
  group,
  before: Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        stem: r.stem,
        correct_key: r.correct_key,
        explanations: r.explanations,
        status: r.status,
        options: r.options,
        lead_in: r.lead_in,
      },
    ])
  ),
  lead_in: out.lead_in,
  options: out.options,
  scenarios: Object.fromEntries(
    out.scenarios.map((s) => {
      const old = (rows.find((r) => r.id === s.id)!.explanations ?? []).find(
        (e) => e.key === rows.find((r) => r.id === s.id)!.correct_key
      );
      return [
        s.id,
        {
          stem: s.stem,
          correct_key: s.correct_key,
          explanations: [
            {
              ...old,
              key: s.correct_key,
              verdict: "correct",
              text: s.explanation,
              citation_chunk_ids: s.citation_chunk_ids,
            },
          ],
          citation_chunk_ids: s.citation_chunk_ids,
        },
      ];
    })
  ),
};

const saved: SetProposal[] = fs.existsSync(PROPOSALS_FILE)
  ? JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf8"))
  : [];
fs.mkdirSync(".review", { recursive: true });
fs.writeFileSync(
  PROPOSALS_FILE,
  JSON.stringify([...saved.filter((x) => x.group !== group), proposal], null, 1),
  "utf8"
);
console.log(`\npasses verification; saved to ${PROPOSALS_FILE}. Read it, then run with --apply.`);
