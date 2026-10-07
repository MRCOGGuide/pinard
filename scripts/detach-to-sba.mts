/**
 * Move one scenario out of an EMQ set and make it a single best answer.
 *
 *   npx tsx scripts/detach-to-sba.mts 2053            propose, change nothing
 *   npx tsx scripts/detach-to-sba.mts 2053 --apply    write the saved proposal
 *
 * For a scenario whose teaching point is a different kind of thing from
 * its set's. Q2053 asks how to interpret an estimated fetal weight after
 * the formula has changed; its siblings ask when to scan. A shared list
 * cannot give both real distractors without mixing categories, which is
 * the fault the reviewer found ("no adequate distractors"). As an SBA it
 * gets five options of its own kind and keeps its teaching point.
 *
 * Detach before redesigning what is left of the set: redesign-set's
 * apply refuses if the set's membership is not what its proposal saw.
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

const NOTES: Record<number, string> = {
  2053:
    "The stem contradicts itself: it says the sonographer measures HC, AC and FL, then that HC cannot be obtained. Write it so HC could not be measured at this scan because of fetal position, and EFW was therefore calculated from AC and FL; the previous scan used HC, AC and FL; the EFW now appears to have fallen across centiles. Ask what the most appropriate interpretation or next step is. The correct answer is that the apparent fall may be an artefact of the change in formula and must be taken into account when comparing. The four distractors are of the same kind and each is shown wrong by the passages, for example: treating the fall as true growth faltering; recalculating with the Hadlock HC, AC and FL formula (HC was not obtainable); comparing the two estimates directly as if the formula were the same. Write every option as a SHORT NOUN PHRASE of about four to eight words, the way the bank's options read, never a sentence and never with a reason attached: for example 'Possible artefact of the formula change', 'True fetal growth restriction', 'Recalculate with HC, AC and FL', 'Directly comparable estimates', 'Interval too short to assess velocity'. Keep the explanation under 90 words.",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const id = Number(args.find((a) => /^\d+$/.test(a)));
const PROPOSALS_FILE = ".review/detach-proposals.json";
const db = createAdminClient();

type Explanation = { key: string; verdict?: string; text: string; citation_chunk_ids?: number[]; source_reference?: string };
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: Explanation[] | null;
  citation_chunk_ids: number[] | null;
  emq_group_id: string | null;
};
const COLUMNS =
  "id, status, format, stem, lead_in, options, correct_key, explanations, citation_chunk_ids, emq_group_id";

const { data } = await db.from("generated_questions").select(COLUMNS).eq("id", id).single();
const q = data as Row | null;
if (!q) {
  console.log("not found");
  process.exit(1);
}

if (apply) {
  const saved = fs.existsSync(PROPOSALS_FILE) ? JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf8")) : {};
  const p = saved[id];
  if (!p) {
    console.log("no saved proposal: propose it first");
    process.exit(1);
  }
  const b = p.before;
  const reason =
    q.status !== b.status ? `status is now ${q.status}`
      : q.stem !== b.stem ? "stem edited"
        : q.correct_key !== b.correct_key ? "answer changed"
          : JSON.stringify(q.explanations) !== JSON.stringify(b.explanations) ? "explanation edited"
            : q.emq_group_id !== b.emq_group_id ? "it has already left its set"
              : null;
  if (reason) {
    console.log(`Q${id}: ${reason} since the proposal was made. Nothing written.`);
    process.exit(1);
  }
  const { error } = await db.from("generated_questions").update(p.after).eq("id", id);
  console.log(error ? `WRITE FAILED: ${error.message}` : `Q${id} is now an SBA, out of its set`);
  process.exit(0);
}

if (q.format !== "emq" || !q.emq_group_id) {
  console.log(`Q${id} is not an EMQ scenario`);
  process.exit(1);
}

const cited = new Set<number>(q.citation_chunk_ids ?? []);
for (const e of q.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) cited.add(c);
const { data: citedRows } = await db.from("content_chunks").select("id, document_id, text").in("id", Array.from(cited));
const docs = Array.from(new Set(((citedRows ?? []) as { document_id: number }[]).map((c) => c.document_id)));
const { data: sameDoc } = await db.from("content_chunks").select("id, text").in("document_id", docs);
const subject = /(EFW|estimated fetal weight|Hadlock|formula|centile|biometry|growth velocity|fetal growth restriction)/i;
const passages = [
  ...((citedRows ?? []) as { id: number; text: string }[]),
  ...((sameDoc ?? []) as { id: number; text: string }[]).filter((c) => !cited.has(c.id) && subject.test(c.text)).slice(0, 10),
];
const retrieved = new Set(passages.map((c) => c.id));

const task = `TASK: Rewrite ONE EMQ scenario as a single best answer question with five options of its own.

THE REVIEWER'S NOTE:
${NOTES[id] ?? "Keep the teaching point; give it five options of one kind."}

RULES
- Keep the teaching point of the scenario. The stem must not contradict itself, must not contain its own answer, and must contain only details that play a part in the answer.
- Five options, keys A to E, alphabetical by text, all the same kind of thing, each twelve words or fewer.
- Each distractor must be shown wrong by the SOURCE PASSAGES. No fact from memory.
- The explanation is the correct option's: why it is right and briefly why the most tempting distractor is wrong, 30 to 90 words.

OUTPUT: ONLY this JSON.
{"stem": "...", "options": [{"key":"A","text":"..."}], "correct_key": "A", "explanation": "...", "citation_chunk_ids": [1], "note": "one sentence"}`;

const current = JSON.stringify(
  {
    stem: q.stem,
    answer: q.options.find((o) => o.key === q.correct_key)?.text,
    explanation: (q.explanations ?? []).find((e) => e.key === q.correct_key)?.text,
  },
  null,
  1
);

type Out = {
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanation: string;
  citation_chunk_ids: number[];
  note?: string;
};

function verify(out: Out): string[] {
  const problems: string[] = [];
  if (out.options.length !== 5) problems.push(`${out.options.length} options, not 5`);
  if (!out.options.some((o) => o.key === out.correct_key)) problems.push("correct_key matches no option");
  if (!out.citation_chunk_ids?.length || !out.citation_chunk_ids.every((c) => retrieved.has(c))) {
    problems.push("cites a passage it was not given, or none");
  }
  const asked = `${out.stem}\n${out.options.map((o) => o.text).join("\n")}`;
  const prose = `${out.stem}\n${out.explanation}`;
  problems.push(
    ...g.optionSentenceProblems(out.options),
    ...g.overlappingOptionProblems(out.options),
    ...g.optionJustificationProblems(out.options),
    ...g.ukEnglishProblems(prose),
    ...g.emDashProblems(prose),
    ...g.selfTalkProblems(prose),
    ...g.sourceNarrationProblems(out.explanation),
    ...g.studyAttributionProblems(asked),
    ...g.listRecallProblems(out.stem),
    ...g.explanationLengthProblems(out.explanation),
    ...g.answerInStemProblems(out.stem, out.options, out.correct_key),
    ...g.ratioInQuestionProblems(asked),
    ...g.figureGroundingProblems(out.explanation, [
      ...passages.filter((c) => out.citation_chunk_ids?.includes(c.id)).map((c) => c.text),
      asked,
    ])
  );
  return problems;
}

/*
  Up to three attempts, each told what the last one failed. Re-rolling
  blind gave three different failures in three runs; naming the failure
  is what a reviewer would do, and costs one more call at most.
*/
const client = claudeClient({ timeout: 180_000 });
let out: Out | null = null;
let problems: string[] = [];
let feedback = "";
for (let attempt = 1; attempt <= 3; attempt++) {
  const response = await client.messages.create({
    model: claudeModel(),
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content:
          PROMPT_G + "\n\n" + PROMPT_L + "\n\n" + task +
          `\n\nTHE SCENARIO AS IT STANDS:\n${current}\n\nSOURCE PASSAGES:\n${passages.map((c) => `[chunk:${c.id}] ${c.text}`).join("\n\n")}` +
          feedback,
      },
    ],
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

console.log(`\nnote: ${out.note ?? ""}\n\nSTEM: ${out.stem}\n`);
for (const o of out.options) console.log(`  ${o.key}. ${o.text}${o.key === out.correct_key ? "   <= CORRECT" : ""}`);
console.log(`\nEXPLANATION (${out.explanation.split(/\s+/).length} words): ${out.explanation}`);

if (problems.length) {
  console.log(`\nFAILS VERIFICATION, not saved:`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const old = (q.explanations ?? []).find((e) => e.key === q.correct_key);
const saved = fs.existsSync(PROPOSALS_FILE) ? JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf8")) : {};
saved[id] = {
  before: {
    status: q.status,
    stem: q.stem,
    correct_key: q.correct_key,
    explanations: q.explanations,
    emq_group_id: q.emq_group_id,
  },
  after: {
    format: "sba",
    emq_group_id: null,
    lead_in: null,
    stem: out.stem,
    options: out.options,
    correct_key: out.correct_key,
    explanations: [
      { ...old, key: out.correct_key, verdict: "correct", text: out.explanation, citation_chunk_ids: out.citation_chunk_ids },
    ],
    citation_chunk_ids: out.citation_chunk_ids,
  },
};
fs.mkdirSync(".review", { recursive: true });
fs.writeFileSync(PROPOSALS_FILE, JSON.stringify(saved, null, 1), "utf8");
console.log(`\npasses verification; saved to ${PROPOSALS_FILE}.`);
