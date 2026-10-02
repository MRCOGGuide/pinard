/**
 * The pending queue, read set by set.
 *
 *   npx tsx scripts/fix-pending-batch.mts
 *   npx tsx scripts/fix-pending-batch.mts --apply
 *
 * Seventeen pending EMQ sets, read in full rather than audited, because
 * every fault the reviewer has found this week was one a careful read
 * catches and the audits did not: a stem that answers itself, a
 * vignette about one thing asking about another, a figure the source
 * itself has wrong.
 *
 * Eleven edits here, all prose. The answer does not move in any of
 * them. #1996, where it does, is its own script.
 *
 *  #1964  described the answer and asked for its name. A console
 *         surgeon who "could not perform it independently and had to
 *         wait for the bedside assistant" IS loss of control over
 *         accessory tasks, so the scenario now puts an inexperienced
 *         bedside team in theatre and leaves the candidate to know why
 *         that matters at the console.
 *  #1966  said the same thing three times, "the test may fail to
 *         return a result", "you are counselling her about the
 *         limitations", then asked the question. 75 words to 44.
 *  #1967  set its scene with a woman considering NIPT for fetal Rh
 *         status and then asked the minimum fetal fraction for
 *         ANEUPLOIDY detection. The scene is now the aneuploidy test.
 *  #1970  had two defensible answers. A woman starting a biologic at
 *         27 weeks, asked whether it can be continued, can be answered
 *         with certolizumab pegol, which the passage says "should have
 *         lower neonatal blood concentrations" because it is a Fab
 *         fragment rather than whole IgG-1. The stem now names the drug
 *         she is actually starting, so the question is the timing.
 *  #1975  told the candidate that NSAIDs could not be used, which is
 *         half of what it meant to test, over 85 words.
 *  #1978  gave her creatinine as 95 and offered thresholds of 90, 110
 *         and 120: two distractors fell to arithmetic. Her number is
 *         gone.
 *  #1979  repeated a figure its own source has wrong. The passage says
 *         "the risk of female carriers of BRCA2 mutations developing
 *         breast cancer before the age of 70 years is 5-20%", and
 *         5-20% is the BRCA2 OVARIAN risk; BRCA2 breast cancer risk is
 *         far higher than that. The BRCA1 figures either side of it are
 *         right, so the BRCA2 clause goes and nothing replaces it.
 *         Grounding cannot catch this: the card was faithful.
 *  #1984  recited karyomapping's definition and asked its name. It now
 *         gives the problem only karyomapping solves, two conditions
 *         in one cycle.
 *  #1985  said IVF comes "after 2 years of expectant management". NICE
 *         says after 2 years OF SUBFERTILITY, which this couple has
 *         not reached at 18 months, and the difference is six months
 *         against two and a half years of her life.
 *  #1987  argued for split IVF-ICSI while the marked answer was ICSI
 *         and split insemination sat in the option list. After total
 *         fertilisation failure the next cycle is ICSI; split is the
 *         strategy for a first cycle where fertilisation is in doubt.
 *         The card now says why ICSI is justified here, which is the
 *         failed cycle and not the diagnosis, since neither NICE nor
 *         the ASRM recommends it routinely for unexplained
 *         subfertility.
 *  #1994  opened in lower case.
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
const {
  selfTalkProblems,
  ukEnglishProblems,
  sourceNarrationProblems,
  emDashProblems,
  explanationLengthProblems,
  listRecallProblems,
} = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

type Edit = {
  id: number;
  stem?: string;
  /** Either a find/replace within the answer's explanation, or all of it. */
  from?: string;
  to?: string;
  explanation?: string;
  /** Quotes that must appear in this question's own cited passages. */
  grounds: string[];
};

const EDITS: Edit[] = [
  {
    id: 1964,
    stem:
      "A unit is planning its first robotic gynaecological operating list. Both the bedside assistant and the scrub nurse are new to the platform. Which feature of robotic surgery makes their inexperience a particular hazard once the console surgeon is operating?",
    grounds: [
      "The robotic surgeon loses control over accessory tasks such as change or removal of instruments and has to rely more on the robotic surgical assistant and scrub nurse",
    ],
  },
  {
    id: 1966,
    stem:
      "A 34-year-old woman with a BMI of 41 kg/m² has a high-risk combined first trimester screening result for trisomy 21 at 12 weeks. She is keen to avoid invasive testing and asks about NIPT. Approximately what proportion of NIPT tests fail to give a result?",
    grounds: ["3%"],
  },
  {
    id: 1967,
    stem:
      "A 28-year-old woman has NIPT by massive parallel sequencing at 11 weeks after a high-risk screening result for trisomy 21. The laboratory reports the fetal fraction of cell-free DNA in the sample. Below what fetal fraction can a euploid fetus not reliably be distinguished from an aneuploid one?",
    grounds: [
      "sufficient cell-free fetal DNA must be present in the total cell-free DNA population analysed; for aneuploidy detection this is 4%",
    ],
  },
  {
    id: 1970,
    stem:
      "A 32-year-old woman with Crohn's disease is 27 weeks pregnant with severe disease refractory to steroids and thiopurines. Her gastroenterologist is starting infliximab. What should be advised about its use for the remainder of the pregnancy?",
    grounds: [
      "many clinicians will discontinue biologics by 30– 32 weeks of gestation to decrease placental transport to the fetus",
    ],
  },
  {
    id: 1975,
    stem:
      "A 35-year-old woman is 5 days postpartum after a vaginal delivery and has stage 3 chronic kidney disease. Her perineal pain is not controlled by paracetamol and she needs parenteral analgesia. She is not volume-depleted, her blood pressure is normal and her creatinine is at her pre-pregnancy baseline. Which agent is most appropriate?",
    grounds: ["fentanyl"],
  },
  {
    id: 1978,
    stem:
      "A 30-year-old woman is three days postpartum after an uncomplicated vaginal delivery and is found to have a newly raised serum creatinine. She has no pre-existing renal disease and no other abnormal findings. Above what serum creatinine should kidney injury be considered in pregnancy?",
    grounds: ["90"],
  },
  {
    id: 1979,
    from:
      " The risk of breast cancer before 70 years in BRCA1 carriers is higher, at 60–80%, while BRCA2 carriers face a 5–20% risk of breast cancer before 70; these distinctions are clinically important when counselling women about the specific risks attached to each mutation.",
    to:
      " The risk of breast cancer before 70 years in BRCA1 carriers is higher still, at 60–80%, and the two figures are counselled separately because risk-reducing surgery addresses them separately.",
    grounds: [
      "the risk of female carriers of BRCA1 mutation developing breast cancer or ovarian cancer before the age of 70 years is 60–80% and 30–60%, respectively",
    ],
  },
  {
    id: 1984,
    stem:
      "A couple attend the PGD clinic. The woman carries a balanced translocation, both partners carry the same single gene disorder, and they want both conditions tested in one cycle. Samples are available from the couple and from their affected child. Which laboratory technique should be used?",
    grounds: [
      "Karyomapping enables diagnosis of more than one monogenic disorder, or of a monogenic disorder and a chromosomal rearrangement simultaneously",
      "genotyped in the parents and also a close relative of a known genetic status",
    ],
  },
  {
    id: 1985,
    from:
      "Couples with unexplained subfertility having regular unprotected intercourse should not routinely be offered IUI, and IVF should only be considered after 2 years of expectant management.",
    to:
      "Couples with unexplained subfertility should not routinely be offered IUI, and the advice is to proceed directly to IVF after 2 years of subfertility, which at 18 months this couple has not reached.",
    grounds: [
      "recommends not routinely offering IUI to couples with unexplained subfertility but proceeding directly to IVF after 2 years of subfertility",
    ],
  },
  {
    id: 1987,
    explanation:
      "Conventional IVF produces no fertilisation at all in 5–25% of couples with unexplained subfertility, probably from occult abnormalities of sperm or oocyte, and ICSI is advocated once that has happened. It raises the fertilisation rate (RR 1.49, 95% CI 1.35–1.65), with five couples treated to prevent one further fertilisation failure, although pregnancy and live birth rates are no better than with conventional IVF. Neither NICE nor the American Society for Reproductive Medicine recommends ICSI routinely for unexplained subfertility: what justifies it for this couple is the failed cycle, not the diagnosis.",
    grounds: [
      "In 5–25% of cases of unexplained subfertility, no fertilisation has been reported with conventional IVF procedures",
      "ICSI has been advocated for these couples",
      "higher fertilisation rate with ICSI compared with IVF (RR 1.49, 95% CI 1.35–1.65)",
      "the need to treat five participants with ICSI to prevent one case of fertilisation failure",
      "do not recommend routine ICSI for unexplained subfertility",
    ],
  },
  {
    id: 1994,
    from: "hepatic adenomas (HAs) less than 5 cm at presentation",
    to: "Hepatic adenomas (HAs) less than 5 cm at presentation",
    grounds: ["HAs less than 5 cm at presentation with no evidence of complications may be observ"],
  },
];

let changed = 0;
for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, status, stem, correct_key, options, explanations, citation_chunk_ids")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);
  /*
    Approved as well as pending: the reviewer is working through the
    queue while this runs, and four of these were approved between the
    read and the repair. An approved question with the fault is still
    the fault, and #1773 and #1704 were both approved when it was
    reported.
  */
  if (!["pending", "approved"].includes(row.status as string)) {
    throw new Error(`#${edit.id} is ${row.status}`);
  }

  /* Everything claimed must be in the passages this question cites. */
  const cites = new Set<number>((row.citation_chunk_ids ?? []) as number[]);
  for (const e of (row.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
    for (const id of e.citation_chunk_ids ?? []) cites.add(id);
  }
  const { data: chunks, error: chunkError } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", [...cites]);
  if (chunkError) throw chunkError;
  const passage = (chunks ?? [])
    .map((c) => (c.text as string) ?? "")
    .join("\n")
    .replace(/\s+/g, " ");
  for (const quote of edit.grounds) {
    if (!passage.includes(quote)) {
      throw new Error(`#${edit.id}: the passages do not contain "${quote.slice(0, 70)}"`);
    }
  }

  const list = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];
  const answer = list.find((e) => e.key === row.correct_key);
  if (!answer) throw new Error(`#${edit.id}: no explanation for ${row.correct_key}`);

  let nextExplanation = answer.text;
  if (edit.explanation) {
    nextExplanation = edit.explanation;
  } else if (edit.from) {
    if (!answer.text.includes(edit.from)) {
      throw new Error(`#${edit.id}: "${edit.from.slice(0, 50)}" is not in the explanation`);
    }
    nextExplanation = answer.text.replace(edit.from, edit.to ?? "");
  }

  const nextStem = edit.stem ?? (row.stem as string);

  for (const text of [nextStem, nextExplanation]) {
    const problems = [
      ...selfTalkProblems(text),
      ...ukEnglishProblems(text),
      ...sourceNarrationProblems(text),
      ...emDashProblems(text),
    ];
    if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);
  }
  const long = explanationLengthProblems(nextExplanation);
  if (long.length) throw new Error(`#${edit.id}: ${long.join("; ")}`);
  const listed = listRecallProblems(nextStem);
  if (listed.length) throw new Error(`#${edit.id}: ${listed.join("; ")}`);

  /*
    A rewritten stem must not carry the answer's own words. Checked on
    the words the answer owns, five letters or more, because "the" and
    "with" are nobody's.
  */
  if (edit.stem) {
    const answerText =
      ((row.options ?? []) as { key: string; text: string }[]).find(
        (o) => o.key === row.correct_key
      )?.text ?? "";
    const own = (answerText.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter(
      (w) => !["serum", "daily", "weeks", "units"].includes(w)
    );
    const echoed = own.filter((w) => nextStem.toLowerCase().includes(w));
    if (own.length >= 2 && echoed.length === own.length && !/\d/.test(answerText)) {
      throw new Error(`#${edit.id}: the new stem still contains the whole answer`);
    }
  }

  const update: Record<string, unknown> = {};
  if (edit.stem) update.stem = nextStem;
  if (nextExplanation !== answer.text) {
    update.explanations = list.map((e) =>
      e.key === row.correct_key ? { ...e, text: nextExplanation } : e
    );
  }
  if (Object.keys(update).length === 0) throw new Error(`#${edit.id}: nothing to change`);

  console.log(`#${edit.id} ${row.status}`);
  if (edit.stem) {
    console.log(`   stem ${(row.stem as string).split(/\s+/).length} -> ${nextStem.split(/\s+/).length} words`);
    console.log(`   ${nextStem}`);
  }
  if (nextExplanation !== answer.text) {
    console.log(`   explanation ${nextExplanation.split(/\s+/).length} words`);
    if (edit.from) console.log(`   - ${edit.from.trim().slice(0, 100)}`);
    console.log(`   + ${(edit.to ?? edit.explanation ?? "").trim().slice(0, 140)}`);
  }

  if (apply) {
    const { error } = await db.from("generated_questions").update(update).eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
  changed += 1;
}

console.log(`\n${changed} question(s) ${apply ? "saved" : "to save - pass --apply"}`);
