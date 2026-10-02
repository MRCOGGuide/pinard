/**
 * #1464 marked the practice it tells you to abandon; #1825 asked for
 * the only surgical option in its list.
 *
 *   npx tsx scripts/fix-1464-1825.mts
 *   npx tsx scripts/fix-1464-1825.mts --apply
 *
 * #1464 sent a sentinel node for frozen section, asked whether that was
 * appropriate practice, and marked "Frozen section of SLN" — while its
 * own explanation said frozen section "is not recommended" and "the
 * team should abandon this approach". Being told "frozen section of
 * SLN" is not an answer to "is this appropriate?". The list already
 * carries what the guidance does recommend: "Ultrastaging protocols
 * improve detection of lymph-node metastasis and should be used for
 * the pathological processing of SLNs." So the question asks how the
 * nodes should be processed, and frozen section becomes what it should
 * always have been — the distractor, with the reason under the answer.
 *
 * #1825 said "She has no previous bariatric surgery" and then "She asks
 * about surgical options", against a list with exactly one operation in
 * it. The clause earned nothing and the question asked nothing; she now
 * asks what more can be done, and the candidate has to know that a BMI
 * over 40 with a failed year of lifestyle measures is where surgery
 * comes in rather than another drug.
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

type Edit = {
  id: number;
  stem: string;
  answerText?: string;
  explanation?: string;
  cites?: number[];
};

const EDITS: Edit[] = [
  {
    id: 1464,
    stem:
      "A 62-year-old woman with FIGO stage IB1 cervical cancer (tumour 1.8 cm, squamous cell carcinoma) is undergoing robotic radical hysterectomy. SLN mapping is performed using ICG injected into the cervix, and sentinel nodes are identified bilaterally in the pelvic external iliac regions. The operating gynaecological oncologist is asked how the sentinel nodes should be processed by the pathology department. What should they be told?",
    /** "Ultrastaging of SLN" — found by text, not by letter. */
    answerText: "Ultrastaging of SLN",
    /* The passages that carry the recommendation and the frozen-section
       figures; the question used to cite neither. */
    cites: [13455, 13459, 13466],
    explanation:
      "Ultrastaging improves the detection of lymph node metastasis by 10–15% in cervical cancer and 37–43% in endometrial cancer, and is recommended for the pathological processing of sentinel nodes: the node is serially sectioned at 50–250 micrometres and each slice assessed with H&E, with immunohistochemistry on a single slice. Frozen section misses half of node-positive disease and is not recommended in cervical cancer.",
  },
  {
    id: 1825,
    stem:
      "A 38-year-old woman with PCOS and metabolic syndrome has a BMI of 41 kg/m². She has been engaged in a structured lifestyle modification programme for over a year with minimal sustained weight loss. She has well-controlled type II diabetes managed with oral hypoglycaemics. She asks what more can be done to help her lose weight.",
  },
];

for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, correct_key, options, explanations")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  const texts = [edit.stem, ...(edit.explanation ? [edit.explanation] : [])];
  for (const text of texts) {
    const problems = [
      ...selfTalkProblems(text),
      ...ukEnglishProblems(text),
      ...sourceNarrationProblems(text),
    ];
    if (problems.length) throw new Error(`#${edit.id}: ${problems.join("; ")}`);
  }

  const options = (row.options ?? []) as { key: string; text: string }[];
  const explanations = (row.explanations ?? []) as { key: string; text: string }[];
  const oldKey = row.correct_key as string;
  const next = edit.answerText
    ? options.find((o) => o.text === edit.answerText)
    : options.find((o) => o.key === oldKey);
  if (!next) throw new Error(`#${edit.id}: "${edit.answerText}" is not an option`);

  /*
    The stem must no longer write the ANSWER out in full. A distractor
    in the stem is a different thing and often the point: #1825's
    "Lifestyle modification alone" is wrong precisely because she has
    spent a year doing it, and the stem has to say so.
  */
  const lower = edit.stem.toLowerCase();
  const own = (next.text.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []).filter(
    (w) => !["alone", "without", "serial", "sectioning"].includes(w)
  );
  if (own.length >= 2 && own.every((w) => lower.includes(w))) {
    throw new Error(`#${edit.id}: the answer is still written out in the stem`);
  }

  console.log(`#${edit.id}  ${oldKey} -> ${next.key}  ${next.text}`);
  console.log(`   now: ${edit.stem.slice(-160)}`);

  if (apply) {
    const patch: Record<string, unknown> = { stem: edit.stem, correct_key: next.key };
    patch.explanations = explanations.map((e) =>
      e.key === oldKey
        ? {
            ...e,
            key: next.key,
            text: edit.explanation ?? e.text,
            ...(edit.cites ? { citation_chunk_ids: edit.cites } : {}),
          }
        : e
    );
    if (edit.cites) patch.citation_chunk_ids = edit.cites;
    const { error } = await db.from("generated_questions").update(patch).eq("id", edit.id);
    if (error) throw new Error(`#${edit.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
