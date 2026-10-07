/**
 * Every check the generator is supposed to have passed, run again over
 * the bank.
 *
 *   npx tsx scripts/audit-queue.mts              the pending queue
 *   npx tsx scripts/audit-queue.mts --approved   the whole approved bank
 *   npx tsx scripts/audit-queue.mts --ids 2022,2028
 *
 * Why run them twice. Verification happens inside generation, on the
 * object the model returned, and whatever it rejects is retried or
 * flagged. What it cannot see is a question written before a rule
 * existed, or one whose check joined the verifier after it was already
 * in the queue. Rules here have only ever been added, so the older half
 * of the bank has never been held to the newer half of the standard.
 *
 * This reads what is actually stored, applies every check that can be
 * applied without the source passages, and prints what fails. It writes
 * nothing: repairs are separate scripts with their own review step.
 *
 * It cannot replace reading the questions. Nothing here knows that
 * hyperemesis resolves, or that an anaesthetist recommends the
 * anaesthesia rather than asking an obstetrician to choose it. Those
 * are faults a clinician finds, and the list of them is the input to
 * the next prompt rule rather than an output of this.
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
const g = await import("../src/lib/generation");

const args = process.argv.slice(2);
const wantApproved = args.includes("--approved");
const idsArg = args.indexOf("--ids");
const onlyIds =
  idsArg >= 0 && args[idsArg + 1]
    ? new Set(args[idsArg + 1].split(",").map((s) => Number(s.trim())))
    : null;

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanation: string | null;
  explanations: { key: string; text: string }[] | null;
  emq_group_id: string | null;
};

const db = createAdminClient();
const all = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select(
      "id, status, format, stem, lead_in, options, correct_key, explanation, explanations, emq_group_id"
    )
    .order("id")
    .range(from, to)
);

const rows = all.filter((r) =>
  onlyIds
    ? onlyIds.has(r.id)
    : wantApproved
      ? r.status === "approved"
      : r.status === "pending"
);

console.log(
  `auditing ${rows.length} question(s)${
    onlyIds ? "" : wantApproved ? " (approved)" : " (pending)"
  }\n`
);

const STOP = new Set([
  "the", "a", "an", "of", "for", "with", "and", "or", "to", "in", "on",
  "at", "by", "is", "her", "his", "she", "he", "this", "that", "from",
  "no", "not", "most", "appropriate", "next", "step", "management",
  "woman", "weeks", "year", "old", "what", "which", "should", "would",
]);

function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

/** Every check that needs only the stored question. */
function checkOne(q: Row): string[] {
  const problems: string[] = [];
  const explain = (q.explanations ?? []).map((e) => e.text).join("\n");
  const prose = [q.stem, q.lead_in ?? "", explain].join("\n");

  const add = (label: string, found: string[]) => {
    for (const f of found) problems.push(`${label}: ${f}`);
  };

  add("UK English", g.ukEnglishProblems(prose));
  add("em dash", g.emDashProblems(prose));
  /* What is ASKED only. Evidence named under the answer is allowed; the
     first version of this read the explanation and reported every card
     that cited its trial where it should, which is how Q2066's ANODE
     explanation came to be listed as a fault. */
  add(
    "study attribution",
    g.studyAttributionProblems(
      [q.stem, ...(Array.isArray(q.options) ? q.options : []).map((o) => o.text)].join("\n")
    )
  );
  add("study subject", g.studySubjectProblems(explain));
  add("source narration", g.sourceNarrationProblems(explain));
  add("self-talk", g.selfTalkProblems(prose));
  add("list recall", g.listRecallProblems(q.stem));
  add("explanation length", g.explanationLengthProblems(explain));

  const opts = Array.isArray(q.options) ? q.options : [];
  add("option carries its own justification", g.optionJustificationProblems(opts));
  add("overlapping options", g.overlappingOptionProblems(opts));

  if (!opts.some((o) => o.key === q.correct_key)) {
    problems.push("structure: correct_key matches no option");
  }
  if (opts.length < 2) problems.push("structure: fewer than two options");
  if (!(q.explanations ?? []).some((e) => e.key === q.correct_key)) {
    problems.push("structure: the correct option has no explanation");
  }

  /*
    The answer said aloud in the stem. A stem naming the thing the
    options ask you to choose has stopped being a question, and it is
    the fault a reader notices first and a verifier never does.
  */
  const stemWords = contentWords(q.stem);
  const correct = opts.find((o) => o.key === q.correct_key);
  if (correct) {
    const ow = [...contentWords(correct.text)];
    if (ow.length >= 2 && ow.every((w) => stemWords.has(w))) {
      problems.push(
        `gives the answer away: the stem already contains every content word of the correct option (${ow.join(", ")})`
      );
    }
  }

  /*
    A ratio in what is ASKED. The agreed rule keeps the RR and its
    interval in the explanation, where they teach, so only the stem and
    the options are read here. Reading the explanation, as the first
    version did, flagged explanations for doing exactly what they should.
  */
  add(
    "ratio asked for",
    g.ratioInQuestionProblems([q.stem, ...opts.map((o) => o.text)].join("\n"))
  );

  return problems;
}

/** Checks that only make sense across a whole EMQ set. */
function checkSet(set: Row[]): string[] {
  const problems: string[] = [];
  const options = set[0]?.options ?? [];

  /* The generator's own check, not a copy of it. This had its own
     threshold, which stayed at nine words after the verifier's moved to
     twelve: the audit would then have reported faults the generator
     no longer refuses. */
  problems.push(...g.optionSentenceProblems(options));

  /*
    Answerable by category. If a scenario asks for an investigation and
    the list holds exactly one investigation, the candidate needs no
    medicine to answer it: they need to spot the shape.
  */
  /* Only a fault when a scenario's ANSWER is the lone member of its
     kind: a list with one imaging option and no scenario answered by it
     gives nothing away, and counting the list alone flagged a hundred
     sets that way. */
  const patterns: Record<string, RegExp> = {
    anaesthesia: /anaesthe/,
    imaging: /\b(mri|ultrasound|tvs|ct\b|scan|measurement)/,
    counselling: /^(inform|reassure|tell|advise)/,
    surgical: /\b(suture|tamponade|hysterectomy|embolisation|radiology)\b/,
  };
  for (const [name, re] of Object.entries(patterns)) {
    const members = options.filter((o) => re.test(o.text.toLowerCase()));
    if (members.length !== 1) continue;
    const answeredBy = set.filter((s) => s.correct_key === members[0].key).map((s) => s.id);
    if (answeredBy.length) {
      problems.push(
        `exactly one ${name} option in the list (${members[0].key}) and Q${answeredBy.join(", Q")} answers with it: answerable by spotting the only ${name} option`
      );
    }
  }

  return problems;
}

let clean = 0;
const failing: { id: number; problems: string[] }[] = [];

for (const q of rows) {
  const problems = checkOne(q);
  if (problems.length === 0) clean += 1;
  else failing.push({ id: q.id, problems });
}

const sets = new Map<string, Row[]>();
for (const q of rows) {
  if (q.format !== "emq" || !q.emq_group_id) continue;
  sets.set(q.emq_group_id, [...(sets.get(q.emq_group_id) ?? []), q]);
}
const setProblems: { ids: number[]; problems: string[] }[] = [];
sets.forEach((set) => {
  const problems = checkSet(set);
  if (problems.length) setProblems.push({ ids: set.map((s) => s.id), problems });
});

for (const f of failing) {
  console.log(`Q${f.id}`);
  for (const p of f.problems) console.log(`   ${p}`);
}
if (setProblems.length) {
  console.log(`\n--- EMQ sets ---`);
  for (const s of setProblems) {
    console.log(`set ${s.ids.join(", ")}`);
    for (const p of s.problems) console.log(`   ${p}`);
  }
}

console.log(
  `\n${clean} of ${rows.length} clean on the per-question checks; ${failing.length} with findings; ${setProblems.length} set(s) with findings`
);

/*
  --faults-out <file>: the findings as repair notes, in the shape
  repair-queue --faults reads. Each kind of finding carries the standing
  instruction for fixing it, so the note says what to do and not only
  what is wrong. A set's findings go to its first scenario, whose repair
  rewrites the shared list; the other scenarios answer by letter, so the
  note forbids changing what their answers mean.
*/
const outAt = args.indexOf("--faults-out");
if (outAt >= 0) {
  const HOW: [RegExp, string][] = [
    [/runs to \d+ words|instruction to counsel/, "Shorten every flagged option to a short clinical item of 12 words or fewer (nine is better), keeping its meaning and its letter; where the correct option is the longest, shorten it or bring the others to a similar length so length does not mark the answer. Conditions and qualifiers belong in the explanation."],
    [/gives the answer away/, "Remove the giveaway from the stem (the words it shares with the correct option) without changing the answer or the clinical picture."],
    [/ratio asked for/, "Ask for the magnitude a clinician would quote in words (for example 'approximately halved', 'about twice as likely') rather than the ratio itself; keep the ratio and its interval in the explanation. Never compute a percentage the passages do not state."],
    [/study subject|study attribution/, "Ask about the woman or the guidance, not about a study: no study, trial, meta-analysis or review named or described in the stem or options."],
    [/exactly one .* option in the list/, "A scenario is answered by the only option of its kind. Reword one or two options that are NOT any scenario's answer into plausible options of the same kind, so the answer cannot be found by category."],
    [/overlapping options/, "Make the two overlapping options distinct, so that neither is the other narrowed by a qualifier, keeping the answer."],
    [/explanation length/, "Shorten the explanation of the correct option to the ceiling, keeping every fact it needs and dropping detail the answer does not need."],
  ];
  const noteFor = (problems: string[]) => {
    const how = new Set<string>();
    for (const p of problems) for (const [re, h] of HOW) if (re.test(p)) how.add(h);
    return `An automated check found the following:\n${problems.map((p) => `- ${p}`).join("\n")}\nHow to fix: ${Array.from(how).join(" ")}`;
  };
  const out: Record<string, { note: string }> = {};
  for (const f of failing) out[String(f.id)] = { note: noteFor(f.problems) };
  for (const s of setProblems) {
    const id = String(s.ids[0]);
    const note =
      noteFor(s.problems) +
      ` This is an EMQ set: the option list is shared by scenarios ${s.ids.join(", ")}, which answer by letter. Reword options only; do not add, remove or reorder them, and do not change the meaning of any option that is another scenario's answer.`;
    out[id] = { note: out[id] ? `${out[id].note}\n${note}` : note };
  }
  fs.writeFileSync(args[outAt + 1], JSON.stringify(out, null, 1));
  console.log(`\n${Object.keys(out).length} repair note(s) written to ${args[outAt + 1]}`);
}
