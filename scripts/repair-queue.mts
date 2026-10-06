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
/**
 * Passages a repair needs that its question never cited.
 *
 * Each entry was read before it was added. 2022's own citation states
 * the two-, three- and four-factor rules but refers to Appendix I for
 * what the risk factors are; 20195 is that appendix's algorithm
 * (smoker, BMI > 30, and hyperemesis listed under transient factors)
 * and 20202 is the scoring table (smoker 1, obesity 1, or 2 at a BMI
 * of 40 or more).
 */
const EXTRA_PASSAGES: Record<number, number[]> = {
  2022: [20195, 20202],
  /*
    2063 cites 18291, which mentions the two manoeuvres only to say how
    few registrars know them. The same document, RCOG's Management of
    Impacted Fetal Head at Caesarean Birth (2025), describes both:
    18269 is its Table 1 of techniques, 18280 its section on the
    Patwardhan manoeuvre with the end of the reverse breech section
    before it.
  */
  2063: [18269, 18280],
  /*
    2058 cites 19016. GTG 29 itself, in the same document, defines the
    grades (19017) and reports that 3c and fourth-degree tears do
    significantly worse than 3a and 3b, and 3b worse than 3a (19018).
  */
  2058: [19017, 19018],
  /*
    2029's guideline, the 2025 placenta praevia and accreta guidance:
    11976 is its recommendation on the choice of anaesthetic method,
    11988 the care bundle in which a consultant anaesthetist plans and
    supervises the anaesthesia.
  */
  2029: [11976, 11988],
  /*
    GTG 45, the guideline 2064 is written from: 19416 is the
    recommendation that an increasing requirement for pain relief should
    raise awareness of impending uterine rupture, 19417 the classic
    triad present in fewer than 10% of ruptures.
  */
  2064: [19416, 19417],
  /*
    The TOG review on antenatal VTE, for 2028's second round: 14614 says
    intravenous UFH should be considered where heparin is essential and
    the haemorrhage risk is high, for its short half-life and reversal
    with protamine; 14615 that it suits imminent delivery because its
    effect is reversed within four hours of stopping the infusion.
  */
  2028: [14614, 14615],
};

const FAULTS: Record<number, string> = {
  /*
    Third attempt, and the one the reviewer's own correction points to.
    The first made the hyperemesis current; the second asked for a
    third persisting factor the cited passage did not hold. Both kept
    the answer at 28 weeks, and both were wrong for the same reason:
    once the hyperemesis has settled she has two current risk factors,
    and two do not earn antenatal prophylaxis at all.

    So the answer moves rather than the stem bending to keep it. Kept
    this way the question tests exactly the point the reviewer made: a
    candidate who counts the hyperemesis picks 28 weeks; one who knows
    it is transient picks postpartum.
  */
  2022:
    "The question counts a resolved episode of hyperemesis gravidarum as a third risk factor and answers 'from 28 weeks'. Hyperemesis is a TRANSIENT risk factor (listed as such in the passages): it justifies LMWH while she is admitted with it, and it does not count once it has resolved. Without it she has two current risk factors, smoking and obesity (BMI 33, which scores 1), and with two current risk factors the guidance is prophylactic LMWH for at least 10 days postpartum and no antenatal LMWH. Repair the question so that this is the correct answer. In the stem, say plainly that the hyperemesis admission was earlier and has now resolved, so the candidate has to recognise it as transient rather than be told the count. Keep the question asking when prophylactic LMWH should be given. The correct option is the postpartum one; reword it as a short item that matches the guidance (at least 10 days postpartum, nothing antenatally). The 28-week option stays as the distractor a candidate reaches by counting the hyperemesis. The explanation gives the count, says why hyperemesis does not count now, says that she would have been offered LMWH while admitted with it, and gives what three and four current factors would have meant.",
  2028:
    "Two faults. First, the stem says she undergoes emergency caesarean at 32 weeks with no indication given; a preterm caesarean needs the reason it happened. Second, she is commenced on unfractionated heparin where LMWH is the normal thromboprophylaxis, and nothing explains why. The explanation must say that LMWH is standard and what displaced it here.",
  /*
    Second steer. The first moved the question to the obstetric
    consultant, who then recommended the anaesthesia to the woman: the
    same role error the reviewer corrected, one seat over.
  */
  2029:
    "The stem has the consultation backwards: the anaesthetic team asks the obstetric consultant which mode of anaesthesia to recommend. The anaesthetist recommends the type of anaesthesia; the obstetrician does not. The passages say a consultant anaesthetist plans and directly supervises the anaesthesia, and that the choice of anaesthetic procedure is discussed with the woman. Rewrite the stem so that the consultant obstetric ANAESTHETIST reviews her antenatally to plan anaesthesia for her planned caesarean birth, and ask what she should be advised. Do not have the obstetrician recommend or choose the anaesthesia, and do not have anyone ask the obstetrician to.",
  2030:
    "Too easy. The scenario describes a Type 3 caesarean scar pregnancy and then asks what risk she must be aware of, and only one option in the list is a counselling statement, so it can be answered without reading the vignette. Make the scenario require the candidate to know which risk follows from this diagnosis rather than which option is the only one of its shape.",
  /*
    Second steer. The first put aspirin straight back into the closing
    question ("next step regarding aspirin"), which is the giveaway the
    reviewer asked to remove, and still gave her no reason to be on it.
  */
  2047:
    "Two faults, both the reviewer's. First, the woman is said to be taking aspirin for pre-eclampsia prophylaxis with no risk factor in her history that would have prompted it. Give her one in the history (for example chronic hypertension, or pre-eclampsia in a previous pregnancy) so that the aspirin is explained. Second, the closing question names the aspirin, which points straight at the answer. The closing question must be exactly 'What is the most appropriate management?' with no mention of aspirin, antiplatelet therapy, platelets or bleeding in that sentence. The aspirin may appear once, in the history, as a medication she takes, and nowhere else in the stem.",
  2052:
    "The scenario asks 'When should serial ultrasound for fetal growth commence?', which is a diary question rather than a clinical one. Ask what the most appropriate management or fetal surveillance is. The whole set needs revising on the same principle.",
  /*
    The rest of the 2052 set. The reviewer asked for the whole set to be
    revised, and the first pass took only the scenario they named.
  */
  /*
    Second steer. The first reworded the question to ask for an
    interpretation and left the answer as the name of a method, so the
    answer still did not answer the question.
  */
  2053:
    "The correct option is 'EFW calculated using AC and FL only, without HC', which names a method and does not answer the question asked. Keep the vignette and keep the question asking for the most appropriate interpretation of an apparent centile shift. REWORD OPTION A, keeping its letter, so that it states the interpretation the passages give: that the shift may be an artefact of changing the EFW formula rather than a true change in growth. Nine words at most, for example 'Possible artefact of the change in EFW formula'. Option A is this scenario's answer only; leave every other option exactly as it is, because the other scenarios in the set answer by their letters.",
  2054:
    "The woman is 27+3 weeks pregnant and the stem says she has been admitted to the POSTNATAL ward. A pregnant woman is admitted to an antenatal ward. Correct that, and check the rest of the vignette is possible as written. Keep the question and its answer.",
  /*
    The reviewer's decision, once told that NICE's own wording is this
    broad: keep the question, cut the words. All five options are cut
    together, because shortening only the answer would make it the one
    short option among four long ones, which is a cue of its own.
  */
  2057:
    "Keep the question, the correct answer and its meaning. The options are too long, the correct one worst at 28 words. Shorten EVERY option to a short clinical item of nine words or fewer, so that no option stands out by length. The correct option must still carry the guidance's point: the positive result is interpreted with the clinical assessment, not acted on alone. For example 'Interpret with clinical assessment, not alone'. Keep each distractor's meaning (erythromycin on the test alone; manage as P-PROM on the test alone; nitrazine to confirm; reassure and discharge). Keep the option letters and the correct letter. The explanation may keep the full guidance wording.",
  2058:
    "The stem says 'a third-degree obstetric anal sphincter injury' without its grade. The guidance grades third-degree tears 3a, 3b and 3c, and reports that 3c and fourth-degree tears have significantly poorer outcomes than 3a and 3b, so the grade is a clinical fact the candidate needs. State the grade in the stem: the vignette describes an external anal sphincter repair, which fits a 3a or 3b tear; use 3b and give its definition in brackets as the passages do (more than 50% of EAS thickness torn). Keep the question and its answer (60-80% asymptomatic at 12 months) as they are: that figure is given for OASIS after EAS repair as a whole. In the explanation add one sentence, from the passages, that outcomes are significantly poorer after 3c and fourth-degree tears than after 3a and 3b. Do not claim the 60-80% figure is specific to any grade.",
  /*
    The rewrite, which the reviewer chose once offered. One run had
    produced it unasked and it was narrowed then, because a repair is
    not licence to rewrite; with the reviewer's say-so it is. The
    unasked version had the consultant try reverse breech extraction
    first and then switch, which is not how the two are used, so the
    vignette is written here.
  */
  2063:
    "REWRITE this question. It currently asks what proportion of UK registrars are familiar with the Patwardhan technique, which is survey trivia. Replace it with a clinical question on how the manoeuvre is performed. Vignette: at caesarean birth at full dilatation the fetal head is found deeply impacted in the pelvis; the consultant elects to use the Patwardhan manoeuvre, and both fetal arms have been delivered through the uterine incision. Ask what the next step is. Do not have anyone attempt reverse breech extraction first. The correct answer is the delivery of the breech as the passages describe it. Options are five short clinical items of nine words or fewer, all steps or manoeuvres, for example: traction through the axillae with fundal pressure; grasp the feet from the upper uterus; lift the head out of the pelvis (wrong because it comes after the breech); Mauriceau-Smellie-Veit manoeuvre; extend the incision to an inverted T. Every claim in the explanation must come from the passages: describe the whole Patwardhan sequence, how it differs from reverse breech extraction, why each distractor is wrong, and that it is rarely practised or taught in the UK. Do not name the evidence in the stem.",
  /*
    The reviewer's reading of the original, which is the point to keep:
    "develops increasingly frequent epidural top-ups" reads as though
    she has a condition by that name. Something observed about her is
    written as observed, by whoever observed it. And GTG 45 cannot
    support asking which CTG abnormality comes first, so the question
    tests the point it does make: that a rising requirement for pain
    relief should raise awareness of impending rupture.
  */
  2064:
    "Rewrite the stem so the woman does not 'develop' epidural top-ups: write it as an observation, for example 'her midwife notes that she has needed increasingly frequent epidural top-ups'. The passages cannot support asking which CTG abnormality is most common, and asking whether the CTG is abnormal tests what every trainee already knows. Instead make the increasing requirement for pain relief the clue: a woman in planned VBAC labour with an epidural, whose midwife notes she has needed increasingly frequent top-ups. Leave out persistent pain between contractions, scar tenderness and vaginal bleeding, which would make the answer obvious. Ask what this observation should raise awareness of. The correct answer is impending uterine rupture. Options are five short items of nine words or fewer, all diagnoses or complications a candidate could consider. The explanation gives the guidance (an increasing requirement for pain relief should raise awareness of impending uterine rupture; epidural analgesia is not contraindicated in VBAC), and, from the passages, that the classic triad is present in under 10% of ruptures and an abnormal CTG is the most consistent finding.",
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
  /*
    Second-round notes, for repairs already applied that the reviewer
    or the audit sent back. They apply to the text as it now stands, and
    are kept apart from FAULTS so the first-round notes stay on record.
    Run with --round2.
  */
};

const ROUND2: Record<number, string> = {
  /*
    The reviewer's own scenario. The first round gave the caesarean an
    indication (twins, FGR) but still no reason for UFH, and twins and
    preterm birth do not make a woman a candidate for anything beyond
    LMWH. A woman already on treatment-dose LMWH for VTE is: she needs
    anticoagulation that can be stopped and reversed quickly around
    surgery.
  */
  2028:
    "The reviewer sent this back: the stem still gives no reason why she needs UFH rather than LMWH, and twins and preterm birth do not put a woman at a VTE risk that needs more than LMWH. Rewrite the vignette as the reviewer suggests: she was diagnosed with a venous thromboembolism earlier in this pregnancy and is on treatment-dose LMWH. She now needs a caesarean birth; give it a clinical indication. Because she still needs anticoagulation and the team want an agent that can be stopped and reversed quickly around surgery and regional anaesthesia, she is converted to intravenous UFH. Do not invent a separate haemorrhage risk. Keep the question asking how often her platelet count should be monitored, and keep the options and the correct answer. The explanation says why UFH was chosen here (from the passages: shorter half-life, reversal with protamine, effect reversed within four hours of stopping, preferred peripartum where heparin is essential and haemorrhage risk is high), that LMWH remains the standard agent otherwise, and gives the monitoring schedule. Keep it under about 110 words.",
  2022:
    "The explanation is 157 words, over the 120-word ceiling; it may run to about 110 because it sets out the bands. Change ONLY the explanation of the correct option. Keep: hyperemesis is a transient risk factor and does not count once resolved; she has two current risk factors (smoking, BMI 33 scoring 1); two current factors mean LMWH for at least 10 days postpartum and none antenatally; she would have been offered LMWH while admitted with the hyperemesis; three factors would mean LMWH from 28 weeks (the distractor) and four or more throughout pregnancy. Remove the sentence about what her score would have been while admitted. Do not change the stem, options or answer.",
  2063:
    "The explanation is 263 words, over the 120-word ceiling; aim for about 90. Change ONLY the explanation of the correct option. Keep: after both arms are delivered, the operator hooks fingers through both axillae and applies gentle traction while the assistant applies fundal pressure to deliver the breech; only then is the head lifted out of the pelvis; it differs from reverse breech extraction, where the feet are grasped first; it is rarely practised or taught in the UK. Keep one short clause on why lifting the head now is wrong (it comes after the breech). Drop the separate paragraphs on the other distractors. Do not change the stem, options or answer.",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const round2 = args.includes("--round2");
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
  emq_group_id: string | null;
};

const NOTES = round2 ? ROUND2 : FAULTS;
const ids = Object.keys(NOTES)
  .map(Number)
  .filter((id) => !only || only.has(id))
  .sort((a, b) => a - b);

type Proposal = {
  id: number;
  before: Pick<Row, "stem" | "options" | "correct_key"> & {
    explanations?: Row["explanations"];
    status?: string;
  };
  after: Pick<Row, "stem" | "options" | "correct_key" | "explanations"> & {
    citation_chunk_ids: number[];
  };
  siblingIds: number[];
};

const PROPOSALS_FILE = ".review/repair-proposals.json";

function loadProposals(): Map<number, Proposal> {
  try {
    const list = JSON.parse(fs.readFileSync(PROPOSALS_FILE, "utf8")) as Proposal[];
    return new Map(list.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

/*
  --apply writes the saved proposals, exactly as they were read, and
  calls no model. Each is checked against the row as it stands now:
  if the stem, options or answer have changed since the proposal was
  made, by a reviewer's own edit or anything else, it is skipped
  rather than written over the newer text.
*/
if (apply) {
  const saved = loadProposals();
  const todo = Array.from(saved.values()).filter((p) => !only || only.has(p.id));
  console.log(`APPLYING ${todo.length} saved proposal(s) from ${PROPOSALS_FILE}\n`);
  let written = 0;
  let skipped = 0;
  for (const p of todo) {
    const { data } = await db
      .from("generated_questions")
      .select("stem, options, correct_key, explanations, status")
      .eq("id", p.id)
      .single();
    const now = data as
      | (Pick<Row, "stem" | "options" | "correct_key" | "explanations"> & { status: string })
      | null;
    /*
      A proposal that does not touch the options neither checks them
      nor writes them. In an EMQ set the list is shared, so another
      scenario's repair can legitimately reword it between this
      proposal and its application; comparing the list would skip a
      sound repair, and writing the stale copy would undo the other.
    */
    const touchesOptions =
      JSON.stringify(p.after.options) !== JSON.stringify(p.before.options);
    /*
      Every field this writes is checked against what the proposal was
      made from, and so is the status. The reviewer works on the same
      queue at the same time: Q2022 was edited and approved by hand a
      minute after its repair was written, and had the order been the
      other way round, a guard that compared only the stem, options and
      answer would have written over their explanation without a word.
      A proposal saved before these fields were recorded cannot prove
      anything about them, so it is skipped rather than trusted.
    */
    const unrecorded =
      p.before.explanations === undefined || p.before.status === undefined;
    const reason = !now
      ? "the question no longer exists"
      : unrecorded
        ? "the proposal predates the full check; propose it again"
        : now.status !== p.before.status
          ? `its status has changed to ${now.status} since it was proposed`
          : now.stem !== p.before.stem
            ? "its stem has been edited since it was proposed"
            : now.correct_key !== p.before.correct_key
              ? "its answer has been changed since it was proposed"
              : JSON.stringify(now.explanations) !== JSON.stringify(p.before.explanations)
                ? "its explanation has been edited since it was proposed"
                : touchesOptions &&
                    JSON.stringify(now.options) !== JSON.stringify(p.before.options)
                  ? "its options have been edited since it was proposed"
                  : null;
    if (reason) {
      console.log(`Q${p.id}  SKIPPED: ${reason}`);
      skipped += 1;
      continue;
    }
    const { options: newOptions, ...rest } = p.after;
    const { error } = await db
      .from("generated_questions")
      .update(touchesOptions ? p.after : rest)
      .eq("id", p.id);
    void newOptions;
    if (error) {
      console.log(`Q${p.id}  WRITE FAILED: ${error.message}`);
      skipped += 1;
      continue;
    }
    /* The rest of an EMQ set takes the same option list, and nothing else. */
    for (const sid of touchesOptions ? p.siblingIds : []) {
      const { error: sibError } = await db
        .from("generated_questions")
        .update({ options: p.after.options })
        .eq("id", sid);
      if (sibError) console.log(`   sibling Q${sid} WRITE FAILED: ${sibError.message}`);
    }
    console.log(
      `Q${p.id}  applied${p.siblingIds.length ? ` (and the shared options of Q${p.siblingIds.join(", Q")})` : ""}`
    );
    written += 1;
  }
  console.log(`\n${written} applied, ${skipped} skipped`);
  process.exit(0);
}

console.log(`proposing repairs for ${ids.length} question(s)\n`);

const proposals: Proposal[] = [];
let repaired = 0;
let refused = 0;
let failedVerification = 0;

for (const id of ids) {
  const { data } = await db
    .from("generated_questions")
    .select(
      "id, status, format, stem, lead_in, options, correct_key, explanations, citation_chunk_ids, emq_group_id"
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

  /*
    Passages from the same guideline that the question never cited but
    the repair needs. Named by hand, one question at a time, after
    reading them: a repair may reach further than the generator did,
    but only into passages a person has checked say what is needed.
  */
  for (const extra of EXTRA_PASSAGES[id] ?? []) cites.add(extra);

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
    PROMPT_FIX.replace("{{fault}}", NOTES[id]) +
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
    /*
      Options come back as a patch when the model returns only the ones
      it changed, which it does despite being asked for the full list.
      Every returned key already in the list overwrites that option's
      text and the rest stand. Taken whole, a one-option reply to an EMQ
      repair would have deleted the options the set's other scenarios
      answer by. A reply carrying a key the list does not have is left
      as it is, so the add-remove-reorder check can refuse it.
    */
    options: Array.isArray(out.options)
      ? (() => {
          const returned = out.options as { key: string; text: string }[];
          const known = new Set(q.options.map((o) => o.key));
          if (!returned.every((o) => known.has(o.key))) return returned;
          const byKey = new Map(returned.map((o) => [o.key, o.text]));
          return q.options.map((o) => ({ ...o, text: byKey.get(o.key) ?? o.text }));
        })()
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
      /* Missing from the first version, which is how two repairs reached
         the bank at 157 and 263 words against a 120-word ceiling. */
      ...g.explanationLengthProblems(explain),
      ...g.optionSentenceProblems(options),
      ...g.optionJustificationProblems(options),
      ...g.overlappingOptionProblems(options),
      ...g.ratioInQuestionProblems(
        [stem, ...options.map((o) => o.text)].join("\n")
      ),
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

  /*
    An EMQ's option list belongs to the whole set, not to one scenario.

    Every scenario row carries its own copy of the list, and the other
    scenarios answer by letter. So a repair to one scenario may reword
    an option, which is then written to every row in the set, but it may
    not add, remove or reorder them: that would silently change what
    the sibling scenarios' correct letters point at. The siblings are
    printed with their answers before and after, so a reword that
    changes the meaning of someone else's answer is seen before it is
    applied.
  */
  let siblings: Row[] = [];
  const optionsChanged =
    JSON.stringify(next.options) !== JSON.stringify(q.options);
  if (q.format === "emq" && q.emq_group_id && optionsChanged) {
    const keys = (o: { key: string }[]) => o.map((x) => x.key).join(",");
    if (keys(next.options) !== keys(q.options)) {
      problems.push(
        "an EMQ repair may reword options but not add, remove or reorder them: the other scenarios in the set answer by letter"
      );
    }
    const { data: sib } = await db
      .from("generated_questions")
      .select(
        "id, status, format, stem, lead_in, options, correct_key, explanations, citation_chunk_ids, emq_group_id"
      )
      .eq("emq_group_id", q.emq_group_id)
      .neq("id", q.id);
    siblings = (sib ?? []) as Row[];
    if (siblings.length) {
      console.log(`\n  shared option list: also written to ${siblings.map((s) => `Q${s.id}`).join(", ")}`);
      for (const s of siblings) {
        const before = q.options.find((o) => o.key === s.correct_key)?.text;
        const after = next.options.find((o) => o.key === s.correct_key)?.text;
        console.log(
          `    Q${s.id} answers ${s.correct_key}: ${before === after ? `unchanged ("${after}")` : `"${before}" -> "${after}"`}`
        );
      }
    }
  }

  if (problems.length) {
    console.log(`\n  REPAIR INTRODUCES NEW FAULTS, not applied:`);
    for (const p of problems) console.log(`    ${p}`);
    failedVerification += 1;
    console.log();
    continue;
  }

  /* citation_chunk_ids are carried across from the explanation that
     was there before, keyed by option. A repair that rewrote the words
     still cites the passage it was written from, and the grounding
     audit reads them from here. */
  const byKey = new Map((q.explanations ?? []).map((e) => [e.key, e]));
  const merged = (next.explanations ?? []).map((e) => {
    const old = byKey.get(e.key);
    return {
      ...old,
      ...e,
      citation_chunk_ids: e.citation_chunk_ids ?? old?.citation_chunk_ids ?? [],
      verdict:
        e.verdict ??
        old?.verdict ??
        (e.key === next.correct_key ? "correct" : "incorrect"),
    };
  });

  proposals.push({
    id,
    before: {
      stem: q.stem,
      options: q.options,
      correct_key: q.correct_key,
      explanations: q.explanations,
      status: q.status,
    },
    after: {
      stem: next.stem,
      options: next.options,
      correct_key: next.correct_key,
      explanations: merged,
      /* The question now rests on whatever its explanations cite,
         which after a repair can include passages it never cited
         before. Recorded at the question level too, because that is
         where the grounding audit looks. */
      citation_chunk_ids: Array.from(
        new Set([
          ...(q.citation_chunk_ids ?? []),
          ...merged.flatMap((e) => e.citation_chunk_ids ?? []),
        ])
      ),
    },
    siblingIds: siblings.map((s) => s.id),
  });
  repaired += 1;
  console.log();
}

/*
  Kept as a file, so what is applied is what was read. The model does
  not give the same repair twice, and an --apply that called it again
  would write a fresh, unreviewed repair over the one the reviewer
  approved. Merged into what is already saved, so proposing again for
  one question does not throw away the rest.
*/
const saved = loadProposals();
for (const p of proposals) saved.set(p.id, p);
fs.mkdirSync(".review", { recursive: true });
fs.writeFileSync(
  PROPOSALS_FILE,
  JSON.stringify(Array.from(saved.values()), null, 1),
  "utf8"
);

console.log(
  `\n${repaired} repaired (proposed), ${refused} refused by the model, ${failedVerification} failed verification`
);
if (repaired > 0) {
  console.log(
    `\nSaved to ${PROPOSALS_FILE}. Read them, then run with --apply to write exactly these.`
  );
}
