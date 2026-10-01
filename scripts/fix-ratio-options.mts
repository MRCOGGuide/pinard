/**
 * Turn the remaining ratio option lists into magnitudes.
 *
 *   npx tsx scripts/fix-ratio-options.mts
 *   npx tsx scripts/fix-ratio-options.mts --apply
 *
 * Same rule as #1740–#1742: ask for the magnitude a clinician says out
 * loud, keep the ratio under the answer. The ratios all stay in the
 * explanations, where they were already written.
 *
 * Wording is chosen to need no arithmetic from the reader. An odds
 * ratio of 3.23 is "about three times"; a risk ratio of 0.34 is "about
 * one-third of the risk", not "a two-thirds reduction". The grounding
 * check has refused a derived percentage before — "reduced by
 * approximately 45%" from RR 0.55 — and a figure a candidate has to
 * compute is no better than the decimal it came from.
 *
 * #1167 is not here. It asks which of five outcome-and-odds-ratio
 * pairings is correctly stated, so there is no magnitude to ask for:
 * the question IS the matching exercise. It is rejected separately.
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
const { selfTalkProblems, ukEnglishProblems, sourceNarrationProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

type Option = { key: string; text: string };

type Job = {
  what: string;
  /** Every row sharing the list — one for an SBA, the set for an EMQ. */
  ids: number[];
  options: Option[];
  /** The new lead-in, where it named the ratio it wanted. */
  leadIn?: string;
  /** Per scenario: its new answer, and the closing it should ask. */
  answers: { id: number; key: string; stem?: { from: string; to: string } }[];
};

const JOBS: Job[] = [
  {
    what: "#394 — postsurgical medical therapy and pain recurrence",
    ids: [394],
    options: [
      { key: "A", text: "No reduction in recurrence" },
      { key: "B", text: "Recurrence reduced by about a tenth" },
      { key: "C", text: "Recurrence reduced by about a third" },
      { key: "D", text: "Recurrence reduced by about half" },
      { key: "E", text: "Recurrence reduced by about two-thirds" },
    ],
    answers: [
      {
        id: 394,
        key: "C",
        stem: {
          from:
            "According to ESHRE guidance, compared with surgery alone, what is the relative risk of pain recurrence at 12 months or less with postsurgical medical therapy?",
          to:
            "Compared with surgery alone, by roughly how much does postsurgical medical therapy reduce pain recurrence at 12 months or less?",
        },
      },
    ],
  },
  {
    what: "#552 — sequential HRT and endometrial cancer",
    ids: [552],
    options: [
      { key: "A", text: "No increase in risk" },
      { key: "B", text: "About 1.5 times" },
      { key: "C", text: "About twice" },
      { key: "D", text: "About three times" },
      { key: "E", text: "About five times" },
    ],
    answers: [
      {
        id: 552,
        key: "D",
        stem: {
          from:
            "what is the relative risk of endometrial cancer in women over 50 using sHRT with Medroxyprogesterone Acetate (MPA) or Norethisterone (NET) for 10–12 days per month for more than 5 years, compared with non-users?",
          to:
            "how much more likely is endometrial cancer in women over 50 using sHRT with Medroxyprogesterone Acetate (MPA) or Norethisterone (NET) for 10–12 days per month for more than 5 years, compared with non-users?",
        },
      },
    ],
  },
  {
    what: "#1193 — oophorectomy and cardiovascular mortality",
    ids: [1193],
    options: [
      { key: "A", text: "No increase in risk" },
      { key: "B", text: "About 1.2 times" },
      { key: "C", text: "About 1.5 times" },
      { key: "D", text: "Almost twice" },
      { key: "E", text: "More than three times" },
    ],
    answers: [
      {
        id: 1193,
        key: "D",
        stem: {
          from:
            "Compared with ovarian conservation, what is the hazard ratio for cardiovascular mortality if she undergoes bilateral oophorectomy?",
          to:
            "Compared with ovarian conservation, how much more likely is death from cardiovascular disease if she undergoes bilateral oophorectomy?",
        },
      },
    ],
  },
  {
    what: "#451–#453 — risk factors for a small baby",
    ids: [451, 452, 453],
    leadIn:
      "Each of the following clinical scenarios relates to **antenatal risk assessment for fetal growth restriction**. For each patient, select the SINGLE most appropriate risk figure from the list above. Each option may be used once, more than once or not at all.",
    options: [
      { key: "A", text: "No increase in risk" },
      { key: "B", text: "About 1.1 times" },
      { key: "C", text: "About 1.5 times" },
      { key: "D", text: "About twice" },
      { key: "E", text: "About two and a half times" },
      { key: "F", text: "About three times" },
      { key: "G", text: "About four times" },
      { key: "H", text: "About five times" },
      { key: "I", text: "About eight times" },
      { key: "J", text: "About ten times" },
    ],
    answers: [
      {
        id: 451,
        key: "I",
        stem: {
          from:
            "What is the adjusted odds ratio for a subsequent SGA infant below the 5th centile in a woman whose previous infant was also below the 5th centile?",
          to:
            "How much more likely is a subsequent SGA infant below the 5th centile in a woman whose previous infant was also below the 5th centile?",
        },
      },
      {
        id: 452,
        key: "E",
        stem: {
          from:
            "What is the odds ratio for SGA associated with gastric bypass surgery, independent of BMI?",
          to: "How much more likely is SGA after gastric bypass surgery, independent of BMI?",
        },
      },
      {
        id: 453,
        key: "F",
        stem: {
          from:
            "What is the odds ratio for SGA associated with cocaine use, as cited in RCOG guidance on fetal growth restriction?",
          to: "How much more likely is SGA in a woman using cocaine?",
        },
      },
    ],
  },
  {
    what: "#470–#471 — placenta praevia after ART",
    ids: [470, 471],
    options: [
      { key: "A", text: "1 in 100 to 1 in 10 000" },
      { key: "B", text: "1 in 50 to 1 in 500" },
      { key: "C", text: "About twice" },
      { key: "D", text: "About three times" },
      { key: "E", text: "About four times" },
      { key: "F", text: "About six times" },
      { key: "G", text: "85.9%" },
      { key: "H", text: "86%" },
      { key: "I", text: "88%" },
      { key: "J", text: "Over 90%" },
    ],
    answers: [
      {
        id: 470,
        key: "E",
        stem: {
          from:
            "Which single figure most accurately represents the odds ratio for placenta praevia in assisted reproductive technology pregnancies versus spontaneous conceptions?",
          to:
            "How much more likely is placenta praevia in an ART pregnancy than in a spontaneous conception?",
        },
      },
      { id: 471, key: "J" },
    ],
  },
  {
    what: "#1403–#1404 — reducing the risk of endometriosis-associated ovarian cancer",
    ids: [1403, 1404],
    leadIn:
      "Each of the following clinical scenarios relates to **the risk reduction of endometriosis-associated ovarian cancer (EAOC)**. For each patient, select the SINGLE most appropriate risk figure from the list above. Each option may be used once, more than once or not at all.",
    options: [
      { key: "A", text: "About one-tenth of the risk" },
      { key: "B", text: "About one-fifth of the risk" },
      { key: "C", text: "About one-third of the risk" },
      { key: "D", text: "About half the risk" },
      { key: "E", text: "About two-thirds of the risk" },
      { key: "F", text: "About three-quarters of the risk" },
      { key: "G", text: "About 85% of the risk" },
      { key: "H", text: "No reduction in risk" },
      { key: "I", text: "About 1.5 times the risk" },
      { key: "J", text: "About twice the risk" },
    ],
    answers: [
      { id: 1403, key: "C" },
      { id: 1404, key: "H" },
    ],
  },
];

for (const job of JOBS) {
  console.log(job.what);
  for (const a of job.answers) {
    const { data: row } = await db
      .from("generated_questions")
      .select("id, stem, lead_in, correct_key, explanations")
      .eq("id", a.id)
      .single();
    if (!row) throw new Error(`#${a.id}: not found`);

    let stem = row.stem as string;
    if (a.stem) {
      if (!stem.includes(a.stem.from)) throw new Error(`#${a.id}: "${a.stem.from.slice(0, 50)}…" is not in the stem`);
      stem = stem.replace(a.stem.from, a.stem.to);
      for (const text of [stem]) {
        const problems = [
          ...selfTalkProblems(text),
          ...ukEnglishProblems(text),
          ...sourceNarrationProblems(text),
        ];
        if (problems.length) throw new Error(`#${a.id}: ${problems.join("; ")}`);
      }
    }
    if (!job.options.some((o) => o.key === a.key)) throw new Error(`#${a.id}: no option ${a.key}`);

    const explanations = (row.explanations ?? []) as { key: string; text: string }[];
    const old = explanations.find((e) => e.key === row.correct_key);
    if (!old) throw new Error(`#${a.id}: no explanation for the answer`);

    console.log(
      `   #${a.id}  ${row.correct_key} -> ${a.key} (${job.options.find((o) => o.key === a.key)?.text})`
    );
    if (a.stem) console.log(`      ${a.stem.to}`);

    if (apply) {
      const patch: Record<string, unknown> = {
        options: job.options,
        correct_key: a.key,
        explanations: explanations.map((e) =>
          e.key === row.correct_key ? { ...e, key: a.key } : e
        ),
      };
      if (a.stem) patch.stem = stem;
      if (job.leadIn) patch.lead_in = job.leadIn;
      const { error } = await db.from("generated_questions").update(patch).eq("id", a.id);
      if (error) throw new Error(`#${a.id}: ${error.message}`);
    }
  }

  /* Rows in the set that are not being re-answered still share the list. */
  const others = job.ids.filter((id) => !job.answers.some((a) => a.id === id));
  if (apply && others.length) {
    for (const id of others) {
      const patch: Record<string, unknown> = { options: job.options };
      if (job.leadIn) patch.lead_in = job.leadIn;
      const { error } = await db.from("generated_questions").update(patch).eq("id", id);
      if (error) throw new Error(`#${id}: ${error.message}`);
    }
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
