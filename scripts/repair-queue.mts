/**
 * Repair the questions a reviewer has read and found fault with.
 *
 *   npx tsx scripts/repair-queue.mts            propose, change nothing
 *   npx tsx scripts/repair-queue.mts --apply    write the repairs
 *   npx tsx scripts/repair-queue.mts --ids 2022,2028
 *
 * The faults below are a clinician's, written in their words. Each is
 * repaired against that question's OWN cited passages, so a repair
 * cannot introduce a fact the question was never entitled to make, and
 * every repair is put back through the full verifier before it is
 * offered. A repair that fails verification is reported and not
 * applied.
 *
 * Repair rather than reject, which was the instruction and is the
 * better one: these questions are mostly sound questions with one
 * thing wrong, and the topic, the passages and the teaching point are
 * worth more than the sentence that spoiled them.
 *
 * Nothing is written without --apply, and with it each question is
 * updated alone, so a failure halfway leaves the rest untouched.
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
const { PROMPT_G, PROMPT_L, PROMPT_FIX } = await import("../src/lib/prompts");
const g = await import("../src/lib/generation");

/**
 * What the reviewer said, question by question.
 *
 * Kept verbatim where they were specific, because the specificity is
 * the whole value: "hyperemesis is usually temporary and not an
 * ongoing risk factor" tells the repair what to do, where "improve
 * this question" does not.
 */
const FAULTS: Record<number, string> = {
  2022:
    "The stem counts an episode of hyperemesis gravidarum towards the risk-factor total that justifies starting LMWH at 28 weeks. Hyperemesis is a transient risk factor: it is scored while it is present and not carried forward to 28 weeks. Replace it with a THIRD PERSISTING risk factor that the passages list and that will still be true at 28 weeks, so that the count of three, and therefore the answer, holds at the gestation being asked about. Do not instead make the hyperemesis current: a woman admitted at 10 weeks has three factors that day and two after discharge, and two factors do not earn antenatal prophylaxis at all, so the answer would no longer follow. Keep the question asking from which gestation prophylactic LMWH should be started.",
  2028:
    "Two faults. First, the stem says she undergoes emergency caesarean at 32 weeks with no indication given; a preterm caesarean needs the reason it happened. Second, she is commenced on unfractionated heparin where LMWH is the normal thromboprophylaxis, and nothing explains why. The explanation must say that LMWH is standard and what displaced it here.",
  2029:
    "The stem has the consultation backwards: the anaesthetic team asks the obstetric consultant which mode of anaesthesia to recommend. In practice the anaesthetist recommends the type of anaesthesia to the obstetric team. Rewrite the stem so the question is asked by, or of, the clinician whose decision it actually is.",
  2030:
    "Too easy. The scenario describes a Type 3 caesarean scar pregnancy and then asks what risk she must be aware of, and only one option in the list is a counselling statement, so it can be answered without reading the vignette. Make the scenario require the candidate to know which risk follows from this diagnosis rather than which option is the only one of its shape.",
  2031:
    "The explanation gives odds ratios and no absolute risk. A candidate cannot counsel a woman with a multiplier. Give the absolute figures the passages support, keeping the ratios beside them if the passages give them.",
  2047:
    "Two faults. The stem says she is already taking aspirin for pre-eclampsia prophylaxis, which both gives the answer away and is unexplained, since the history shows no apparent risk factor that would have prompted it. Remove the aspirin from the stem. The question should ask what the most appropriate management is.",
  2052:
    "The scenario asks 'When should serial ultrasound for fetal growth commence?', which is a diary question rather than a clinical one. Ask what the most appropriate management or fetal surveillance is. The whole set needs revising on the same principle.",
  2057:
    "The correct option is too broad: 'confirm or re-evaluate' is a direction of travel rather than a recommendation, and an option that wide is right whatever the passage says. Make the correct option as specific as the guidance it comes from.",
  2058:
    "The stem describes an obstetric anal sphincter injury without giving its degree. 3a, 3b and 3c differ in whether the woman is likely to be symptomatic and in what follow-up she needs, so the degree is the clinical fact the question turns on. State it.",
  2063:
    "The answer is a manoeuvre most trainees have read about and few have performed. Naming it teaches a candidate the words and not the operation. The explanation must also describe how it is performed, from the passages.",
  2064:
    "Two faults. The stem says the woman develops 'increasingly frequent epidural top-ups', which is not how that presents or is described. And the question asks whether the CTG is abnormal, which every trainee already knows it will be in uterine rupture. Ask which CTG abnormality is the most common or the earliest, if the passages support it.",
  2065:
    "The question asks the candidate to recall a relative risk. A ratio is not a figure anybody counsels with. Ask instead which intervention the evidence supports, so the answer is the clinical act rather than its risk ratio. The ratio may stay in the explanation. Two things the stem must NOT do: it must not name the evidence (no 'Cochrane', no 'randomised trial', no 'meta-analysis' anywhere in the stem or the options, which belongs under the answer if anywhere), and its options must be short clinical items of nine words or fewer, not descriptions of a technique.",
  2066:
    "The stem names the drug that is the correct answer. Remove it from the stem ENTIRELY: not replaced by its abbreviation, its brand name or its class, all of which point at the same answer. 'No contraindication to co-amoxiclav' gives the answer exactly as much as naming amoxicillin and clavulanic acid does. Say instead that she has no allergy or no contraindication to antibiotic prophylaxis, and let the options carry the choice of agent.",
  /*
    The reviewer wrote 2056 and meant 2046. 2056 is a fetal heart rate
    monitoring question with no mention of steroids in it, and the
    model said so rather than inventing a fault to fix, which is the
    behaviour worth keeping. The note is recorded against the question
    it actually describes.
  */
  2046:
    "The stem reasons that 'she has no contraindication to steroids' and that 'fetal lung maturity is not currently an indication for corticosteroids', which argues the candidate out of the answer inside the question. It should instead say that the medical team have decided to commence corticosteroids, and ask which regimen is most appropriate.",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const idsArg = args.indexOf("--ids");
const only =
  idsArg >= 0 && args[idsArg + 1]
    ? new Set(args[idsArg + 1].split(",").map((s) => Number(s.trim())))
    : null;

const db = createAdminClient();
const client = claudeClient({ timeout: 180_000 });

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations:
    | {
        key: string;
        verdict?: string;
        text: string;
        citation_chunk_ids?: number[];
        source_reference?: string;
      }[]
    | null;
  citation_chunk_ids: number[] | null;
};

const ids = Object.keys(FAULTS)
  .map(Number)
  .filter((id) => !only || only.has(id))
  .sort((a, b) => a - b);

console.log(
  `${apply ? "REPAIRING" : "proposing repairs for"} ${ids.length} question(s)\n`
);

let repaired = 0;
let refused = 0;
let failedVerification = 0;

for (const id of ids) {
  const { data } = await db
    .from("generated_questions")
    .select(
      "id, status, format, stem, lead_in, options, correct_key, explanations, citation_chunk_ids"
    )
    .eq("id", id)
    .single();
  const q = data as Row | null;
  if (!q) {
    console.log(`Q${id}  NOT FOUND\n`);
    continue;
  }

  /* The passages this question already cites, and only those. */
  const cites = new Set<number>(q.citation_chunk_ids ?? []);
  for (const e of q.explanations ?? []) {
    for (const c of e.citation_chunk_ids ?? []) cites.add(c);
  }
  if (cites.size === 0) {
    console.log(`Q${id}  no cited passages, cannot repair from source\n`);
    refused += 1;
    continue;
  }

  const { data: chunks } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", Array.from(cites));
  const passages = (chunks ?? [])
    .map((c: { id: number; text: string }) => `[chunk:${c.id}] ${c.text}`)
    .join("\n\n");

  const current = JSON.stringify(
    {
      stem: q.stem,
      lead_in: q.lead_in,
      options: q.options,
      correct_key: q.correct_key,
      explanations: (q.explanations ?? []).map((e) => ({
        key: e.key,
        text: e.text,
      })),
    },
    null,
    1
  );

  const prompt =
    PROMPT_G +
    "\n\n" +
    PROMPT_L +
    "\n\n" +
    PROMPT_FIX.replace("{{fault}}", FAULTS[id]) +
    `\n\nTHE QUESTION AS IT STANDS:\n${current}\n\nSOURCE PASSAGES:\n${passages}`;

  const response = await client.messages.create({
    model: claudeModel(),
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = response.content
    .map((b) => ("text" in b ? b.text : ""))
    .join("")
    .trim();

  let out: Record<string, unknown>;
  try {
    out = JSON.parse(g.extractJson(raw));
  } catch {
    console.log(`Q${id}  could not parse the repair\n`);
    refused += 1;
    continue;
  }

  if (out.ok === false) {
    console.log(`Q${id}  REFUSED: ${out.why}\n`);
    refused += 1;
    continue;
  }

  const next = {
    stem: typeof out.stem === "string" ? out.stem : q.stem,
    options: Array.isArray(out.options)
      ? (out.options as { key: string; text: string }[])
      : q.options,
    correct_key:
      typeof out.correct_key === "string" ? out.correct_key : q.correct_key,
    explanations: Array.isArray(out.explanations)
      ? (out.explanations as Row["explanations"])
      : q.explanations,
  };

  /*
    Judge the repair by what it ADDED, not by what it inherited.

    The first run blocked almost every repair on option lists full of
    sentences, which the repair had not been asked to touch and had
    faithfully left alone. The check was right and the scoping was
    wrong: a question arriving with four faults and leaving with three
    is better, and refusing it keeps all four. So the same checks run
    over the question as it was, and only NEW problems block.
  */
  const faultsOf = (
    stem: string,
    options: { key: string; text: string }[],
    correctKey: string,
    explanations: Row["explanations"]
  ) => {
    const explain = (explanations ?? []).map((e) => e.text).join("\n");
    const prose = [stem, q.lead_in ?? "", explain].join("\n");
    return [
      ...g.ukEnglishProblems(prose),
      ...g.emDashProblems(prose),
      ...g.selfTalkProblems(prose),
      ...g.sourceNarrationProblems(explain),
      /* The QUESTION only. Named evidence is allowed under the answer
         and not in what is asked, so passing the explanations in here
         made a study named in the explanation mask one newly added to
         the stem, which is exactly the fault 2065 was sent to fix. */
      ...g.studyAttributionProblems([stem, ...options.map((o) => o.text)].join("\n")),
      ...g.listRecallProblems(stem),
      ...g.optionSentenceProblems(options),
      ...g.optionJustificationProblems(options),
      ...g.overlappingOptionProblems(options),
      ...g.ratioWithoutAbsoluteProblems(explain),
      ...g.answerInStemProblems(stem, options, correctKey),
    ];
  };

  const was = faultsOf(q.stem, q.options, q.correct_key, q.explanations);
  const now = faultsOf(
    next.stem,
    next.options,
    next.correct_key,
    next.explanations
  );
  /*
    Compared by KIND, not by wording. A repair that rewords an option
    which was already too long produces a different sentence about the
    same fault, and comparing the sentences called that a new problem
    and refused a repair that had improved the question. The signature
    drops the quoted text and the counts and keeps what the complaint
    is about: which check, and which option.
  */
  const signature = (p: string) => {
    /* One option, one check, one signature. The sentence check reports
       through two branches, "is an instruction to counsel" and "runs to
       N words", so an option moving from one branch to the other read
       as a new fault and refused a repair that had shortened it from
       sixteen words to twelve. */
    const option = /^option ([A-Z])\b/.exec(p);
    if (option && /(not a sentence|instruction to counsel)/.test(p)) {
      return `option ${option[1]} is a sentence`;
    }
    return p
      .replace(/"[^"]*"/g, "")
      .replace(/\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };
  const inherited = new Set(was.map(signature));
  const stillThere = new Set(now.map(signature));
  const problems = now.filter((p) => !inherited.has(signature(p)));
  const fixed = was.filter((p) => !stillThere.has(signature(p)));

  if (!next.options.some((o) => o.key === next.correct_key)) {
    problems.push("correct_key matches no option");
  }
  if (!(next.explanations ?? []).some((e) => e.key === next.correct_key)) {
    problems.push("the correct option has no explanation");
  }

  console.log(`${"=".repeat(74)}`);
  console.log(`Q${id}  [${q.format}]  ${q.status}`);
  console.log(`changed: ${JSON.stringify(out.changed ?? [])}`);
  if (out.note) console.log(`note: ${out.note}`);
  if (next.stem !== q.stem) {
    console.log(`\n  BEFORE stem: ${q.stem}`);
    console.log(`\n  AFTER  stem: ${next.stem}`);
  }
  if (JSON.stringify(next.options) !== JSON.stringify(q.options)) {
    console.log(`\n  OPTIONS now:`);
    for (const o of next.options) {
      console.log(`    ${o.key}. ${o.text}${o.key === next.correct_key ? "  <= CORRECT" : ""}`);
    }
  }
  if (JSON.stringify(next.explanations) !== JSON.stringify(q.explanations)) {
    for (const e of next.explanations ?? []) {
      console.log(`\n  EXPLANATION ${e.key}: ${e.text}`);
    }
  }

  if (problems.length) {
    console.log(`\n  REPAIR FAILS VERIFICATION, not applied:`);
    for (const p of problems) console.log(`    ${p}`);
    failedVerification += 1;
    console.log();
    continue;
  }

  if (apply) {
    /* citation_chunk_ids are carried across from the explanation that
       was there before, keyed by option. A repair that rewrote the
       words still cites the passage it was written from, and the
       grounding audit reads them from here. */
    const byKey = new Map(
      (q.explanations ?? []).map((e) => [e.key, e])
    );
    const merged = (next.explanations ?? []).map((e) => {
      const old = byKey.get(e.key);
      return {
        ...old,
        ...e,
        citation_chunk_ids:
          e.citation_chunk_ids ?? old?.citation_chunk_ids ?? [],
        verdict: e.verdict ?? old?.verdict ?? (e.key === next.correct_key ? "correct" : "incorrect"),
      };
    });
    const { error } = await db
      .from("generated_questions")
      .update({
        stem: next.stem,
        options: next.options,
        correct_key: next.correct_key,
        explanations: merged,
      })
      .eq("id", id);
    if (error) {
      console.log(`\n  WRITE FAILED: ${error.message}`);
      continue;
    }
    console.log(`\n  applied`);
  }
  repaired += 1;
  console.log();
}

console.log(
  `\n${repaired} repaired${apply ? "" : " (proposed)"}, ${refused} refused by the model, ${failedVerification} failed verification`
);
if (!apply && repaired > 0) {
  console.log(`\nRe-run with --apply to write them.`);
}
