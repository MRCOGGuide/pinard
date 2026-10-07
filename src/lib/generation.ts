import { unexpandedAbbreviations } from "@/lib/abbreviations";
import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_G, PROMPT_Q, PROMPT_Q_EMQ } from "@/lib/prompts";
import type { QuestionFormat, QuestionOption } from "@/lib/types";
import type { RetrievedChunk } from "@/lib/retrieval";
import {
  describe as describeCystometrogram,
  parseCystometrogram,
} from "@/lib/cystometrogram";
import {
  parseExplanationTable,
  ungroundedCells,
  type ExplanationTable,
} from "@/lib/explanationTable";
import { claudeClient, claudeModel } from "@/lib/anthropic";

/**
 * Question generation service + verification layer (PROJECT.md
 * sections 2 and 7, AI-PROMPTS.md prompts G and Q). Server only.
 */

export type GeneratedExplanation = {
  key: string;
  verdict: "correct" | "incorrect";
  text: string;
  citation_chunk_ids: number[];
  source_reference: string;
};

export type GeneratedQuestion = {
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  /** The combined paragraph shown on the card. */
  explanation: string;
  explanations: GeneratedExplanation[];
  difficulty: number;
  citation_chunk_ids: number[];
  coverage_note: string;
  /** Optional stratification shown under the explanation. */
  explanation_table: ExplanationTable | null;
};

export type StyleExample = {
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  lead_in: string | null;
  rationale: string | null;
};

// UK-English lint list (PROJECT.md section 7). RCOG house style is
// "fetal"/"fetus", so the o-spellings are flagged alongside the
// American forms. Whole-word, case-insensitive.
const AMERICANISMS: { term: string; uk: string }[] = [
  { term: "labor", uk: "labour" },
  { term: "cesarean", uk: "caesarean" },
  { term: "estrogen", uk: "oestrogen" },
  { term: "anesthesia", uk: "anaesthesia" },
  { term: "counseling", uk: "counselling" },
  { term: "counselor", uk: "counsellor" },
  { term: "foetus", uk: "fetus" },
  { term: "foetal", uk: "fetal" },
  /*
    "estrogen" was here and "estradiol" was not, so an option reading
    "20 μg ethinyl estradiol and a low-risk progestin" passed every
    check the bank has. These are the rest of the -ae-, -oe- and -our
    differences that turn up in this specialty.

    Each form is listed rather than stemmed: matching a prefix would
    make "labor" catch "laboratory". And -ize spellings are deliberately
    absent — Oxford spelling admits them, so they are a house choice
    rather than an americanism.
  */
  { term: "estradiol", uk: "oestradiol" },
  { term: "estriol", uk: "oestriol" },
  { term: "estrone", uk: "oestrone" },
  { term: "progestin", uk: "progestogen" },
  { term: "progestins", uk: "progestogens" },
  { term: "gynecology", uk: "gynaecology" },
  { term: "gynecologic", uk: "gynaecological" },
  { term: "gynecological", uk: "gynaecological" },
  { term: "gynecologist", uk: "gynaecologist" },
  { term: "gynecologists", uk: "gynaecologists" },
  { term: "pediatric", uk: "paediatric" },
  { term: "pediatrics", uk: "paediatrics" },
  { term: "hemorrhage", uk: "haemorrhage" },
  { term: "hemorrhagic", uk: "haemorrhagic" },
  { term: "hemodynamic", uk: "haemodynamic" },
  { term: "hemoglobin", uk: "haemoglobin" },
  { term: "hemostasis", uk: "haemostasis" },
  { term: "hematology", uk: "haematology" },
  { term: "anemia", uk: "anaemia" },
  { term: "anemic", uk: "anaemic" },
  { term: "edema", uk: "oedema" },
  { term: "tumor", uk: "tumour" },
  { term: "tumors", uk: "tumours" },
  { term: "diarrhea", uk: "diarrhoea" },
  { term: "gonorrhea", uk: "gonorrhoea" },
  { term: "esophageal", uk: "oesophageal" },
  { term: "etiology", uk: "aetiology" },
  { term: "leukemia", uk: "leukaemia" },
  { term: "orthopedic", uk: "orthopaedic" },
];

export function ukEnglishProblems(text: string): string[] {
  const problems: string[] = [];
  for (const { term, uk } of AMERICANISMS) {
    const re = new RegExp(`\\b${term}\\b`, "i");
    if (re.test(text)) problems.push(`americanism "${term}" (use "${uk}")`);
  }
  return problems;
}

/**
 * Phrases that report on the source instead of explaining the
 * medicine. An explanation is written for a candidate who wants to
 * know why the answer is right; the guidance that establishes it is
 * already named under the card, so prose that narrates the passage
 * adds nothing and reads like a machine reading aloud.
 */
const SOURCE_NARRATION: RegExp[] = [
  /according to the (source |given |provided )?(passage|passages|text|material|extract)/i,
  /\bthe (source )?passages? (states?|says?|describes?|notes?|mentions?|confirms?)/i,
  /as (stated|described|noted|set out|outlined) in the (passage|text|source|extract|material)/i,
  /\bin the (source|provided|given) material\b/i,
  /\bthe (guideline|guidance|document) (states?|says?|presents?|provides?|describes?|notes?|mentions?|cites?)\b/i,
  /*
    The same thing with the document named, which the line above misses
    because it wants the two words adjacent: "the 2014 ESHRE guidelines
    explicitly state", "The EMAS position statement recommends", "The
    guidance stipulates". Ten explanations in the bank were written
    this way, and each of them said the medicine perfectly well once
    the document was taken out of the front.
  */
  /\bthe\s+(?:\d{4}\s+)?(?:[A-Z][A-Za-z-]+\s+){0,3}(?:guideline|guidelines|guidance|recommendations?|statement)\s+(?:explicitly\s+|clearly\s+|specifically\s+)?(?:states?|says?|recommends?|advises?|suggests?|notes?|specifies|requires?|mandates?|stipulates?)\b/i,
  /*
    And a body with a year beside it, which is a reference to an
    edition and ages the moment that edition is replaced — as "NICE
    2013 guidance recommends" and "the RCOG 2011 regimen" already had.
  */
  /\b(?:19|20)\d{2}\s+(?:ESHRE|NICE|RCOG|BSGE|BASHH|FSRH|WHO|ACOG|SOGC|BMS|BGCS|EMAS|MBRRACE|UKOSS)\b/,
  /\b(?:ESHRE|NICE|RCOG|BSGE|BASHH|FSRH|WHO|ACOG|SOGC|BMS|BGCS|EMAS|MBRRACE|UKOSS)\s+(?:19|20)\d{2}\b/,
  /\btable \d+ of the (guideline|guidance)\b/i,
  /\bthe (above|given|provided) passages?\b/i,
  // Where inside a document a fact sits is of no use to a candidate.
  // "The figures marked with an asterisk in Appendix V" is a filing
  // reference, not medicine.
  /\b(appendix|annex|asterisk|footnote)\b/i,
  // Capitalised, because that is how a cross-reference is written and
  // obstetrics is full of the lower-case kind: a figure 8 suture is a
  // suture, and "a caesarean section 2 years ago" is a vignette.
  /\b(Table|Figure|Box) \d+\b/,
];

/**
 * Naming the evidence — kept out of the question, allowed in the answer.
 *
 * A stem that opens "According to the AHRQ meta-analysis data..." asks
 * about provenance. The guidance has adopted the figure, so the
 * guidance is what the candidate answers from, and the study name is
 * wordage to read past.
 *
 * Under the answer it can earn its place. A trial a recommendation
 * actually rests on is worth knowing by name — a senior trainee should
 * recognise the evidence their practice is built on. A small cohort a
 * guideline cites in passing and draws nothing from is not, and neither
 * is the size of an evidence base standing in for the number itself.
 * That distinction is a judgement about the guidance rather than a
 * pattern, so the prompts carry it and this list guards only the stem.
 */
const STUDY_ATTRIBUTION: RegExp[] = [
  /\b(meta-?analysis|systematic review|cohort study|case series|randomi[sz]ed controlled trials?)\b/i,
  /\bRCTs?\b/,
  /\bthe [A-Z][A-Za-z-]{2,} (trial|study|cohort|review)\b/,
  /\b(AHRQ|Cochrane|MBRRACE|CEMACH|CMACE)\b/,
  /\bet al\b/i,
  /\b\d[\d,]*\s+studies\b/i,
  /\bstudies (have\s+)?(shown|found|demonstrated|reported|suggest)\b/i,
  /\ba (large |small |recent |single |multicentre )*stud(y|ies) (found|showed|reported|demonstrated)\b/i,
  /*
    A study named by description rather than by title, with no reporting
    verb after it: "based on a recent Australian population-based study
    using validated questionnaires". None of the patterns above fire on
    that — it is not a meta-analysis or a cohort study by name, it is not
    "the SOMETHING study", and no "found" or "showed" follows — so #1530
    could ask which figure to quote from a paper no candidate has reason
    to know. A study day and study leave are the innocent uses of the
    word in this specialty and are excluded.

    Deliberately case-sensitive on the noun: a capitalised "Study"
    belongs to an organisation's name — the International Society for
    the Study of Vulvovaginal Disease — not to a paper. And "studies"
    after "that" or "which" is the verb: "a framework that studies how
    clinicians adapt".
  */
  /\b(?:[Aa]nother|[Aa]n|[Aa]|[Tt]he|[Tt]his|[Tt]hat|[Oo]ne)\s+(?:[A-Za-z-]+\s+){0,4}(?:study\b|(?<!that\s)(?<!which\s)studies\b)(?!\s+(?:day|leave|period|group|protocol))/,
  /*
    Evidence named without using the word "study" at all. Rewriting the
    voice of 28 stems surfaced three that everything above misses: "the
    population-based Western Australian cohort", "the landmark Diabetes
    Prevention Program", "the CCSS data show survivors take longer to
    conceive".

    The reliable tell is the reporting, not the name. A cohort or a
    registry introduced by "the" is a dataset; "landmark" and its
    synonyms only ever introduce a paper; and "data show", "as reported
    in" and "has been reported" are how a result gets cited. Matching
    the name itself is not reliable — an acronym is usually clinical,
    and "the NHS cervical screening programme" is a service.
  */
  /\b[Tt]he\s+(?:[A-Za-z-]+\s+){0,4}(?:cohort|registry)\b/,
  /\b(?:landmark|pivotal|seminal)\b/i,
  /\bdata (?:show|shows|showed|demonstrate|demonstrated|suggest|suggests)\b/i,
  /\bas (?:reported|demonstrated|shown|found) in\b/i,
  /*
    "has been shown" is deliberately NOT here. It reads as a citation but
    is ordinary exam English that names nothing — "which intrapartum
    intervention has been shown to reduce the likelihood of caesarean
    birth?" is a fair question a candidate answers from clinical
    knowledge, and an AI tool that "has been demonstrated by the vendor"
    is a product demo. This list rejects questions at generation, so a
    pattern that fires on good ones costs more than it saves.
  */
];

/**
 * A stem whose subject is a study rather than a patient.
 *
 * STUDY_ATTRIBUTION above catches a question that ATTRIBUTES a fact to
 * a study — "according to the AHRQ meta-analysis". This catches the
 * harder version, where the study is not the citation but the subject:
 * "A simulation-based crossover study evaluated the impact of
 * incivility... what was the mean TEAM score in the uncivil scenario?"
 * Nothing is being attributed, so the other list never fires, and the
 * candidate is asked to recall a number from a paper's results table.
 *
 * It appears wherever the source is a review rather than a guideline.
 * A guideline states what to do; a TOG article surveys the evidence,
 * so the nearest citable sentence is often a study's finding, and the
 * model reaches for it. Of twelve TOG stems mentioning a study, the
 * existing lint rejected none.
 *
 * Deliberately narrow. "Analysis" is not here, because microarray and
 * semen analysis are ordinary clinical findings; nor is a bare
 * "study", because a passage may legitimately be about one. Measured
 * over the bank this flags 6 of 1000, all of them real.
 */
const STUDY_AS_SUBJECT: RegExp[] = [
  // "The Generation Study", "the OptiBreech trial"
  /\bthe [A-Z][\w-]*(?: [A-Z][\w-]*)* (Study|Trial|Survey)\b/,
  /\b(a|an|the) [\w-]+(?:-based)? (crossover|cohort|case-control|observational|simulation) (study|trial)\b/i,
  // "a survey of", but also "a trainee-led survey of", "a national
  // survey of", "a recent multicentre audit of". Question 1237 read
  // "A trainee-led survey of obstetrics and gynaecology registrars"
  // and the bare form missed it: one adjective was enough to defeat
  // the check.
  /\b(?:a|an|the)\s+(?:[\w-]+\s+){0,3}(?:survey|audit|questionnaire)\s+(?:of|among|across)\b/i,
  // Asking what a paper found, rather than what it means for a woman.
  /\b(?:findings?|results?|conclusions?)\s+(?:reported\s+)?(?:from|of|in)\s+(?:this|the)\s+(?:survey|study|trial|audit|questionnaire)\b/i,
  /\bin a cohort of\b/i,
  /\bprogramme of research\b/i,
  /\b(study|trial|survey|programme) (evaluated|examined|assessed|investigated|compared|recruited|enrolled)\b/i,
  /\baccording to the [\w\s]*\b(survey|study|trial)\b/i,
  /\bin the [A-Z]{3,}\b.{0,20}\bstudy\b/,
];

export function studySubjectProblems(text: string): string[] {
  for (const re of STUDY_AS_SUBJECT) {
    const found = text.match(re);
    if (found) {
      return [
        `the question is about a study rather than a patient ("${found[0]}"): ask what it means for a woman being managed: the risk to quote her, the threshold that changes management, the step that follows. A candidate is examined on the medicine a paper establishes, never on the paper's own results table`,
      ];
    }
  }
  return [];
}

/** Evidence named in a stem or its options, where it does not belong. */
export function studyAttributionProblems(text: string): string[] {
  for (const re of STUDY_ATTRIBUTION) {
    const found = text.match(re);
    if (found) {
      return [
        `the question names the evidence ("${found[0]}"): ask what the guidance recommends; the study belongs under the answer, if anywhere`,
      ];
    }
  }
  return [];
}

export function sourceNarrationProblems(text: string): string[] {
  for (const re of SOURCE_NARRATION) {
    const found = text.match(re);
    if (found) {
      return [
        `narrates the source ("${found[0]}"): explain the clinical reasoning and let source_reference name the guidance`,
      ];
    }
  }
  return [];
}

/**
 * A stem that asks which item "is cited as" or "is listed among" the
 * guidance's bullet points tests whether the candidate has memorised a
 * list, not whether they can manage the woman in front of them. The
 * knowledge is usually the same; the question has to be put clinically
 * — what is her risk, what would you do next, what figure would you
 * quote her.
 */
const LIST_RECALL: RegExp[] = [
  /\b(is|are) (cited|listed|named|mentioned|specified|identified|included) as\b/i,
  /\b(is|are) (cited|listed|named|mentioned) (among|within|in the list)\b/i,
  /\baccording to the (list|table)\b/i,
  /\bwhich .{0,50}\bdoes the (guideline|guidance|document) (list|name|cite|mention)\b/i,
];

export function listRecallProblems(stem: string): string[] {
  for (const re of LIST_RECALL) {
    const found = stem.match(re);
    if (found) {
      return [
        `stem asks which item "${found[0]}", put the question clinically (her risk, the next step, the figure to quote her) instead of asking which items appear in a list`,
      ];
    }
  }
  return [];
}

/**
 * An em dash, which this bank does not use.
 *
 * It reads as an aside, and a question under time pressure is the
 * wrong place for one: a comma, a colon or a full stop is parsed
 * faster, and a dash inside an option is a line break waiting to
 * happen on a phone. Five hundred questions had acquired one before
 * anything was watching.
 *
 * En dashes are untouched. A range is what an en dash is for.
 */
export function emDashProblems(text: string): string[] {
  if (!text.includes("—")) return [];
  return [
    "uses an em dash, which this bank does not: use a comma, a colon, a semicolon, brackets or a full stop",
  ];
}

/**
 * The model thinking out loud in text a candidate reads.
 *
 * #1602's stem ran "The oncology team is selecting the most
 * appropriate chemotherapy regimen. She is 44 years old — wait, she is
 * 32 years old. Which chemotherapy regimen is most appropriate for
 * her?" Everything around it was right: the tumour, the staging, the
 * regimen, and the age the answer turns on. What escaped was the
 * correction itself, written into the vignette.
 *
 * It passed every check the bank had, because none of them were
 * looking for prose that is not about a patient. So this one is a
 * regex, it runs on every field a candidate can see, and it rejects.
 * There is no such thing as an acceptable "wait, actually" in an exam
 * question, so there is nothing here to weigh up.
 *
 * Bounded where a word has clinical uses: "wait" alone is a waiting
 * list and a wait-and-see policy, so only the self-correcting forms
 * match. "Sorry" and "I mean" are not clinical at all, and neither is
 * a chunk id, which the prompts already forbid in prose and which is
 * the other thing that leaks out of a generation.
 */
const SELF_TALK: RegExp[] = [
  // Not a bare "wait": a 2-week-wait referral is a referral pathway,
  // and waiting is half of expectant management.
  /(?:: |–|--)\s*wait,/i,
  /\bwait,\s*(no|sorry|she|he|it|they|that|this|the|actually|I)\b/i,
  /\bactually,?\s*(no|sorry|wait|I|let me|that's|thats|it should)\b/i,
  /\b(sorry|oops|whoops)\b/i,
  /\bI mean\b/i,
  /\blet me (rephrase|correct|revise|redo|fix|try again|reconsider)\b/i,
  /\bcorrection:\s/i,
  /\bon second thought/i,
  /\bscratch that\b/i,
  /\b(ignore|disregard) (the|that|my|this) (previous|last|above|earlier)\b/i,
  /\bas an AI\b/i,
  /\b(hmm|hmmm)\b/i,
  /\[chunk:?\s*\d+\]/i,
  /\bTODO\b/,
  /\b(placeholder|lorem ipsum)\b/i,
];

/**
 * Runs on stems, lead-ins, options, explanations and table cells —
 * every field printed on a card.
 */
export function selfTalkProblems(text: string): string[] {
  for (const re of SELF_TALK) {
    const found = text.match(re);
    if (found) {
      return [
        `the writer is talking to themselves ("${found[0].trim()}"): a candidate reads this text; say the thing once, in the voice of the question`,
      ];
    }
  }
  return [];
}

/**
 * An explanation that has outgrown the card.
 *
 * The prompts already ask for one paragraph of 30-60 words, up to 110
 * where every band of a stratification has to be set out, and the
 * generator keeps to it — the bank's median is 66 words and 280 of 280
 * explanations are a single paragraph. The two that were not, and the
 * two longest in the bank at 170 and 159 words, were both written by
 * hand straight to the database, by an author who had the rule to hand
 * and did not read it.
 *
 * So the ceiling lives here rather than only in the prompt, where it
 * binds anything that writes an explanation and not merely the model.
 * It is set well above the house norm on purpose: this is a backstop
 * against drift, not a style critic, and a question is more likely to
 * be right at 100 words than padded up to them.
 */
const EXPLANATION_WORD_CEILING = 120;

export function explanationLengthProblems(text: string): string[] {
  const problems: string[] = [];
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const words = text.split(/\s+/).filter(Boolean).length;

  if (paragraphs.length > 1) {
    problems.push(
      `the explanation runs to ${paragraphs.length} paragraphs, the card shows one, ` +
        `and every other explanation in the bank is one`
    );
  }
  if (words > EXPLANATION_WORD_CEILING) {
    problems.push(
      `the explanation is ${words} words, past the ${EXPLANATION_WORD_CEILING}-word ceiling ` +
        `, aim for 30-60, up to 110 only when setting out every band of a stratification`
    );
  }
  return problems;
}

/**
 * An option that argues for itself.
 *
 * "TAC placed pre-conceptually or before 14 weeks, as this is the
 * treatment of choice following unsuccessful TVC resulting in PTB
 * before 28 weeks" is an answer with its explanation stapled on. The
 * reasoning belongs under the card, where the candidate reads it after
 * choosing; in the option it is padding at best, and at worst it hands
 * the answer over — the correct option becomes the one arguing hardest
 * for itself, which is a habit that survives into the real exam badly.
 *
 * The test is whether the reason is doing any work. Strip the clauses
 * and look at what is left: if every option is still distinct, the
 * reasons were decoration. If two collapse into the same text, the
 * reason IS the thing being chosen between and belongs exactly where
 * it is — "Stillbirth, because the fetus showed no signs of life at
 * expulsion" against "Stillbirth, because it was expelled after 24
 * completed weeks" is a real question about registration law, and
 * without the becauses it is not a question at all.
 *
 * Measured over the bank: 28 questions carry a justification, 24 of
 * them decoration and 4 load-bearing. Flagging all 28 would have been
 * wrong four times.
 */
const OPTION_JUSTIFICATION =
  /[,;]?\s+\b(as this|as it|as these|as they|as the evidence|because|since this|owing to|given that|in view of|on the grounds that)\b.*$/i;

export function optionJustificationProblems(
  options: { key: string; text: string }[]
): string[] {
  const carrying = options.filter((o) => OPTION_JUSTIFICATION.test(o.text));
  if (carrying.length === 0) return [];

  const stripped = options.map((o) =>
    o.text
      .replace(OPTION_JUSTIFICATION, "")
      .trim()
      .replace(/[;,]$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  // Too little left to be an option at all: the reason was the option.
  if (stripped.some((t) => t.length < 3)) return [];
  // The reason is what the candidate is choosing between. Leave it.
  if (new Set(stripped).size !== stripped.length) return [];

  return [
    `option${carrying.length === 1 ? "" : "s"} ${carrying
      .map((o) => o.key)
      .join(", ")} argue for themselves: the options are already different without the reason, so move it into the explanation. An option states what to do; the card explains why after the candidate has chosen`,
  ];
}

/**
 * Options that are not alternatives to each other.
 *
 * Several options in a single-best-answer may be true statements --
 * that is what makes a hard question hard, and choosing the one that
 * best fits the stem is the skill being tested. What breaks it is an
 * option that is not a rival claim at all, but another option narrowed
 * by a qualifier: "severe OHSS in all cases" against "severe OHSS not
 * manageable in the outpatient setting". Those are one answer and a
 * subset of it, so nothing separates them except the qualifier, and a
 * candidate who knows the guidance perfectly still cannot pick. Worse,
 * the qualified one ends up keyed correct because it is the only one
 * that survives scrutiny -- which makes the question answerable by
 * grammar rather than by medicine.
 *
 * The same fault appears without a qualifier when two options simply
 * restate each other, as question 70 did with two wordings of uterine
 * dehiscence. That one is not caught here: paraphrase detection would
 * cost far more false positives than it is worth, and its symptom is
 * milder -- twin distractors give themselves away as a pair rather
 * than trapping the candidate.
 *
 * Two conditions have to hold together, because containment alone is
 * far too eager. Every content word of one option must appear in the
 * other, AND the longer option's addition must be a conditional clause
 * -- "not manageable in", "unless", "where X is unsuitable". That
 * second test is what separates this fault from the ordinary
 * constructions it otherwise looks like: "mild OHSS only" against
 * "mild and moderate OHSS" is two rival rules, "hysterectomy" against
 * "radical hysterectomy" is two different operations, and neither
 * should be blocked. Measured over the bank, containment alone flagged
 * five questions of which one was real.
 *
 * Figures are excluded for the same reason: options differing by a
 * number are different answers, not a restatement -- "1%" and "0.1%",
 * or "UKMEC 2" and "UKMEC 2 for initiation, UKMEC 3 for continuation".
 */
const OPTION_STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "to", "for", "and", "or", "with", "at",
  "on", "is", "are", "be", "all", "only", "not", "no", "cases", "case",
]);

function optionContentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w && !OPTION_STOP_WORDS.has(w))
  );
}

/**
 * The clause that turns an option into a subset of another one: it
 * narrows the same claim rather than making a different one.
 */
const CONDITIONAL_QUALIFIER =
  /\b(not|unless|except|cannot|unable|unsuitable|inappropriate|fails?|failed|contraindicated|only if|provided that|in whom)\b/i;

export function overlappingOptionProblems(
  options: { key: string; text: string }[]
): string[] {
  const hasDigit = (w: string) => /[0-9]/.test(w);
  const problems: string[] = [];

  for (let i = 0; i < options.length; i++) {
    for (let j = i + 1; j < options.length; j++) {
      const a = optionContentWords(options[i].text);
      const b = optionContentWords(options[j].text);
      if (a.size === 0 || b.size === 0) continue;

      const [small, large] = a.size <= b.size ? [a, b] : [b, a];
      if (large.size <= small.size) continue;
      const smallWords = Array.from(small);
      const largeWords = Array.from(large);
      if (smallWords.some((w) => !large.has(w))) continue;

      // Differing by a figure means differing in substance.
      const extra = largeWords.filter((w) => !small.has(w));
      if (extra.some(hasDigit)) continue;
      if (smallWords.some(hasDigit) && largeWords.some(hasDigit)) continue;

      const shorter = a.size <= b.size ? options[i] : options[j];
      const longer = a.size <= b.size ? options[j] : options[i];

      // The addition has to be a condition, not just more words.
      if (!CONDITIONAL_QUALIFIER.test(longer.text)) continue;
      if (CONDITIONAL_QUALIFIER.test(shorter.text)) continue;
      problems.push(
        `options ${shorter.key} and ${longer.key} cannot be told apart: ` +
          `"${longer.text}" is "${shorter.text}" narrowed by a qualifier, so only the ` +
          `qualifier separates them. Options may each be true, one has to be the best ` +
          `fit for the stem: but no option may be another one narrowed.`
      );
    }
  }
  return problems;
}

/**
 * Lint an admin's edit field by field.
 *
 * The checks themselves are the same ones generation runs, but a
 * reviewer needs to be told where the problem is. Run over one blob of
 * every field, a match reports the phrase and leaves the reviewer to
 * find it — which on a twelve-option EMQ with a per-option explanation
 * each means reading the whole question looking for four words.
 */
export type LintField = {
  label: string;
  text: string;
  /** Does a candidate read this, or is it the admin's working? */
  candidateFacing: boolean;
};

/**
 * The narration rule is scoped exactly as generation scopes it: to what
 * a candidate reads. The per-option working is admin-only, and a stray
 * "the passage notes" there must not block an edit any more than it
 * blocks generation — the card never shows it. UK English applies
 * everywhere, since the owner may paste the working into a question.
 */
export function questionEditProblems(fields: LintField[]): string | null {
  for (const field of fields) {
    const uk = ukEnglishProblems(field.text);
    if (uk.length > 0) return `${field.label}: UK-English: ${uk.join("; ")}`;
  }
  for (const field of fields) {
    if (!field.candidateFacing) continue;
    const narration = sourceNarrationProblems(field.text);
    if (narration.length > 0) return `${field.label} ${narration[0]}`;
  }
  /*
    Self-talk is checked on the admin's working too. It is the one
    thing here that is never deliberate, in any field, by anybody.
  */
  for (const field of fields) {
    const selfTalk = selfTalkProblems(field.text);
    if (selfTalk.length > 0) return `${field.label}: ${selfTalk[0]}`;
  }
  for (const field of fields) {
    const dash = emDashProblems(field.text);
    if (dash.length > 0) return `${field.label}: ${dash[0]}`;
  }
  return null;
}

/**
 * The editable fields of a question, labelled as the form shows them.
 */
export function questionLintFields(input: {
  stem: string;
  options: { key: string; text: string }[];
  explanation: string;
  explanations: { key: string; text: string }[];
}): LintField[] {
  return [
    { label: "Stem", text: input.stem, candidateFacing: true },
    ...input.options.map((op) => ({
      label: `Option ${op.key}`,
      text: op.text,
      candidateFacing: true,
    })),
    { label: "Explanation", text: input.explanation, candidateFacing: true },
    ...input.explanations.map((e) => ({
      label: `Working for option ${e.key}`,
      text: e.text,
      candidateFacing: false,
    })),
  ];
}

/** Build the SOURCE PASSAGES block: [chunk:ID] (Source: reference). */
export function formatPassages(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `[chunk:${c.chunk_id}] (Source: ${c.source_reference})\n${c.text}`
    )
    .join("\n\n");
}

/**
 * A complete EMQ exemplar. Examples are stored one row per scenario
 * sharing emq_group_id; rendering those rows individually shows the
 * model an SBA with a long option list, which is precisely the wrong
 * lesson. They must be reassembled into whole sets first.
 */
export type StyleEmqSet = {
  lead_in: string;
  options: QuestionOption[];
  scenarios: { stem: string; correct_key: string; rationale: string | null }[];
};

/** Rebuild EMQ example rows into whole sets, newest group first. */
export function groupEmqExamples(
  rows: {
    stem: string;
    options: QuestionOption[];
    correct_key: string;
    lead_in: string | null;
    rationale: string | null;
    emq_group_id: string | null;
  }[]
): StyleEmqSet[] {
  const byGroup = new Map<string, StyleEmqSet>();
  for (const row of rows) {
    if (!row.emq_group_id) continue; // a lone row is not a set
    const existing = byGroup.get(row.emq_group_id);
    if (existing) {
      existing.scenarios.push({
        stem: row.stem,
        correct_key: row.correct_key,
        rationale: row.rationale ?? null,
      });
    } else {
      byGroup.set(row.emq_group_id, {
        lead_in: row.lead_in ?? "",
        options: row.options,
        scenarios: [
          {
            stem: row.stem,
            correct_key: row.correct_key,
            rationale: row.rationale ?? null,
          },
        ],
      });
    }
  }
  // Only genuine sets teach the format.
  return Array.from(byGroup.values()).filter((s) => s.scenarios.length >= 2);
}

/** Build the EMQ STYLE EXAMPLES block — whole sets, form only. */
export function formatEmqStyleSets(sets: StyleEmqSet[]): string {
  return sets
    .map((set, i) => {
      const opts = set.options.map((o) => `  ${o.key}. ${o.text}`).join("\n");
      const scenarios = set.scenarios
        .map((s, n) => {
          const lines = [
            `  Scenario ${n + 1}: ${s.stem}`,
            `  Answer: ${s.correct_key}`,
          ];
          if (s.rationale?.trim()) {
            lines.push(`  Explanation: ${s.rationale.trim()}`);
          }
          return lines.join("\n");
        })
        .join("\n\n");
      return [
        `EXAMPLE EMQ SET ${i + 1}, ${set.options.length} shared options, ${set.scenarios.length} scenarios`,
        `Option list (shared by every scenario):\n${opts}`,
        `Lead-in: ${set.lead_in}`,
        `Scenarios:\n${scenarios}`,
      ].join("\n");
    })
    .join("\n\n");
}

/** Build the STYLE EXAMPLES block — form only, never a source of facts. */
export function formatStyleExamples(examples: StyleExample[]): string {
  return examples
    .map((ex, i) => {
      const opts = ex.options
        .map((o) => `  ${o.key}. ${o.text}`)
        .join("\n");
      const parts = [`EXAMPLE ${i + 1} (${ex.format.toUpperCase()})`];
      if (ex.lead_in) parts.push(`Lead-in: ${ex.lead_in}`);
      parts.push(
        `Stem: ${ex.stem}`,
        `Options:\n${opts}`,
        `Answer: ${ex.correct_key}`
      );
      // The exemplar's own explanation is the style to imitate. It was
      // fetched from the bank and then dropped here, so the model had
      // never seen how these are written and fell back on narrating
      // its sources instead.
      if (ex.rationale?.trim()) {
        parts.push(`Explanation: ${ex.rationale.trim()}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

/**
 * Pull the JSON object out of a model response.
 *
 * The prompt asks for JSON and nothing else, and usually that is what
 * comes back. But when the model works the problem out in prose first —
 * most often to conclude the passages cannot support a question — the
 * object arrives after several paragraphs of reasoning. Parsing the
 * whole response then fails on the first letter of the prose, and a
 * correct "insufficient_source_material" is thrown away and counted as
 * a verification failure, which reads to the owner as a broken
 * generator rather than a thin section.
 *
 * So: try the response as it stands, and fall back to the outermost
 * braces.
 */
export function extractJson(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (cleaned.startsWith("{")) return cleaned;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function parseQuestion(raw: string):
  | { question: GeneratedQuestion }
  | { insufficient: true }
  | { parseError: string } {
  const cleaned = extractJson(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : "bad JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { parseError: "response was not a JSON object" };
  }
  const obj = data as Record<string, unknown>;
  if (obj.error === "insufficient_source_material") return { insufficient: true };

  // Structural shape — defensive, so we never store garbage.
  const options = Array.isArray(obj.options)
    ? (obj.options as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const oo = o as Record<string, unknown>;
        if (typeof oo.key !== "string" || typeof oo.text !== "string") return [];
        return [{ key: oo.key, text: oo.text }];
      })
    : [];
  const explanations = Array.isArray(obj.explanations)
    ? (obj.explanations as unknown[]).flatMap((e) => {
        if (typeof e !== "object" || e === null) return [];
        const ee = e as Record<string, unknown>;
        if (typeof ee.key !== "string" || typeof ee.text !== "string") return [];
        const cites = Array.isArray(ee.citation_chunk_ids)
          ? (ee.citation_chunk_ids as unknown[])
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n))
          : [];
        return [
          {
            key: ee.key,
            verdict: ee.verdict === "correct" ? "correct" : "incorrect",
            text: ee.text,
            citation_chunk_ids: cites,
            source_reference:
              typeof ee.source_reference === "string" ? ee.source_reference : "",
          } as GeneratedExplanation,
        ];
      })
    : [];

  const allCites = Array.from(
    new Set(explanations.flatMap((e) => e.citation_chunk_ids))
  );

  const question: GeneratedQuestion = {
    stem: typeof obj.stem === "string" ? obj.stem : "",
    options,
    correct_key: typeof obj.correct_key === "string" ? obj.correct_key : "",
    explanation: typeof obj.explanation === "string" ? obj.explanation.trim() : "",
    explanations,
    difficulty:
      typeof obj.difficulty === "number" ? Math.round(obj.difficulty) : 3,
    citation_chunk_ids: allCites,
    coverage_note:
      typeof obj.coverage_note === "string" ? obj.coverage_note : "",
    explanation_table: parseExplanationTable(obj.explanation_table),
  };
  return { question };
}

/**
 * Verification (PROJECT.md section 7): every citation ∈ retrieved set,
 * every option has an explanation, UK-English lint. Returns the list of
 * problems (empty = passes).
 */
/* ------------------------------------------------------------------ */
/*  Figures, and where they came from                                   */
/* ------------------------------------------------------------------ */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6",
  seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12",
  thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16",
  seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
};

/** One spelling for each unit, so "four hours" and "4 h" are one figure. */
const UNIT_SYNONYMS: [RegExp, string][] = [
  [/\b(hours?|hrs?|h)\b/g, "hour"],
  [/\b(days?)\b/g, "day"],
  [/\b(weeks?|wks?)\b/g, "week"],
  [/\b(months?)\b/g, "month"],
  [/\b(years?|yrs?)\b/g, "year"],
  [/\b(minutes?|mins?)\b/g, "minute"],
  [/\b(micrograms?|mcg|µg)\b/g, "mcg"],
  [/\b(milligrams?)\b/g, "mg"],
  [/\b(millilitres?|ml)\b/g, "ml"],
  [/\bper ?cent\b/g, "%"],
];

const UNITS = "%|hour|day|week|month|year|minute|mg|mcg|g|kg|ml|mmol|micromol|mmhg|iu|units?";

/**
 * Text reduced to the form figures are compared in: lower case, one
 * dash, numbers as digits, units under one name.
 */
export function normaliseFigures(text: string): string {
  let t = text.toLowerCase();
  t = t.replace(/[‒–—−]/g, "-");
  // The Lancet's decimal point is a mid-dot: 0·58 is 0.58.
  t = t.replace(/(\d)·(\d)/g, "$1.$2");
  t = t.replace(/(\d),(\d{3})\b/g, "$1$2");
  // Thousands set with a space, "1 in 10 000", are one number. Left
  // group of at most three digits, so a year beside a count is not.
  t = t.replace(/\b(\d{1,3}) (\d{3})\b/g, "$1$2");
  // "Eighty-five per cent" is 85%: tens and units joined by a hyphen
  // first, before either half is read alone as a number.
  const tens = "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety";
  const units = "one|two|three|four|five|six|seven|eight|nine";
  t = t.replace(
    new RegExp(`\\b(${tens})-(${units})\\b`, "g"),
    (_, a: string, b: string) => String(Number(NUMBER_WORDS[a]) + Number(NUMBER_WORDS[b]))
  );
  t = t.replace(
    new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\b`, "g"),
    (w) => NUMBER_WORDS[w]
  );
  t = t.replace(/\bper ?cent\b/g, "%");
  // "a month", "a week": one of the unit, as "a month for the agonist" is.
  // Not after a number: "10 a day" is a rate, not one day.
  t = t.replace(/(?<!\d\s)\b(a|an)\s+(hours?|days?|weeks?|months?|years?)\b/g, "1 $2");
  for (const [re, canonical] of UNIT_SYNONYMS) t = t.replace(re, canonical);
  t = t.replace(/(\d)\s+%/g, "$1%");
  // "500ml" is "500 ml": a unit set solid against its number.
  t = t.replace(new RegExp(`(\\d)(${UNITS})(?![a-z])`, "g"), (m, d, u) => (u === "%" ? m : `${d} ${u}`));
  /* The first bank-wide run reported these as figures from nowhere,
     and each was the same figure written another way. */
  // 75.0% is 75%, and 1.00 is 1: trailing zeros are typography.
  t = t.replace(/(\d+)\.0+\b/g, "$1");
  // "150/95 mmhg" states both pressures.
  t = t.replace(/\b(\d{2,3})\s*\/\s*(\d{2,3})\s*mmhg/g, "$1 mmhg $2 mmhg");
  // "1/2700" is "1 in 2700", the form an explanation writes it in.
  t = t.replace(/\b(\d{1,3})\s*\/\s*(\d{2,})\b/g, "$1 in $2");
  t = t.replace(/(\d)\s*-\s*(\d)/g, "$1-$2");
  return t.replace(/\s+/g, " ");
}

/**
 * Words that put a number to work as a label rather than a quantity.
 * "Option 3", "grade 3", "evidence level 2" are not figures a passage
 * has to state.
 */
const LABEL_BEFORE = /\b(option|grade|level|table|appendix|chunk|figure|type|stage|class|evidence|section|step|question|q|scenario|para|gravida|g|p)\s*$/;

/**
 * Every figure in an explanation that no source contains.
 *
 * The fault this exists for was found twice in one batch of repairs,
 * both times by reading rather than by any check. An explanation said
 * UFH's effect "is reversed within four hours of stopping the
 * infusion", and another that growth velocity needs "a minimum of three
 * weeks" between scans. Both true, and both taken from passages the
 * model had read but did not cite, so the question asserted figures its
 * own citations could not show. A grounded card that cannot point at
 * where its numbers came from is one bad edit away from an ungrounded
 * one.
 *
 * Deterministic and narrow on purpose. A figure is a number, a range
 * or an "N in M", with its unit when it has one; it is supported when
 * the same figure, unit included, appears in a cited passage or in the
 * question's own stem and options, which is where a vignette's own
 * numbers ("BMI 33", "a four-week interval") come from. Labels (grade
 * 3b, option 4, evidence level 2) are not figures. What it cannot judge
 * is whether a figure is used correctly, only whether it came from
 * somewhere; that is the grounding check's job.
 */
export function figureGroundingProblems(
  explanation: string,
  sources: string[]
): string[] {
  const body = normaliseFigures(explanation);
  /*
    Passages ingested from journals set in the Lancet's style lost their
    decimal points on the way in: GTG 26 reads "RR 058, 95% CI 049–069;
    P < 00001" where the paper printed 0·58 and 0·49–0·69. A number with
    a leading zero and nothing after the zero but digits is, in clinical
    prose, a decimal that lost its point, so the sources are read as
    though it were still there. The explanation is not: it should never
    contain the damaged form.
  */
  const haystack = normaliseFigures(sources.join("\n")).replace(
    /(^|[^0-9.])0(\d{2,5})(?=[^0-9]|$)/g,
    "$10.$2"
  );
  const has = (figure: string) =>
    new RegExp(`(^|[^0-9.])${figure.replace(/[.+%]/g, (c) => `\\${c}`)}($|[^0-9])`).test(haystack);

  const figure = new RegExp(
    // (?![a-z]) rather than \b after the unit: \b cannot match after a
    // "%", which reported "45%" as the bare number "45".
    // An "N in M" is a ratio only with a small N and an M that is not a
    // year: "394781 in 2022" is a count and a date.
    `(\\d{1,3} in (?!(?:19|20)\\d\\d\\b)\\d+|\\d+(?:\\.\\d+)?(?:\\+\\d+)?(?:-\\d+(?:\\.\\d+)?(?:\\+\\d+)?)?)(?:\\s*(${UNITS})(?![a-z]))?`,
    "g"
  );

  const missing = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = figure.exec(body))) {
    const start = m.index;
    const before = body.slice(Math.max(0, start - 14), start);
    const after = body[start + m[0].length] ?? "";
    // A number glued to letters is a label or a code: 3b, g2p1, 4th.
    if (/[a-z]$/.test(body.slice(start - 1, start)) || /^[a-z]/.test(after)) continue;
    if (LABEL_BEFORE.test(before)) continue;
    const value = m[1];
    const unit = m[2];
    // Single digits without a unit carry too little to check honestly.
    if (!unit && /^\d$/.test(value)) continue;
    // A year is a date, not a figure the passage has to state.
    if (!unit && /^(19|20)\d\d$/.test(value)) continue;
    // And so is a span of years: "the 2013-15 report".
    if (!unit && /^(19|20)\d\d-(\d\d|(19|20)\d\d)$/.test(value)) continue;
    // The 95 in "95% CI" is the confidence level, not a finding.
    if (unit === "%" && /^\s*(ci|confidence)\b/.test(body.slice(start + m[0].length))) continue;
    const full = unit ? `${value}${unit === "%" ? "" : " "}${unit}` : value;
    if (has(full)) continue;

    /* A ratio whose second number is not larger than its first is not a
       ratio: "an odds ratio of 8.1 in 1 large series". */
    const ratio = /^(\d+) in (\d+)$/.exec(value);
    if (ratio && Number(ratio[2]) <= Number(ratio[1])) continue;

    /*
      A range is supported when the source states both of its ends.
      Sources write ranges every way: "1.09-1.38", "between 1.09 and
      1.38", "0.59 to 2.10", "29.5%-32.0%", and a table cell with its
      citation numbers glued on. Matching the written form missed most
      of them; matching the ends does not, and still refuses a range
      with an end the source never gives.
    */
    if (/^[\d.+]+-[\d.+]+$/.test(value) && value.split("-").every((end) => has(end))) continue;

    /*
      A unit the source simply leaves off is not a different unit. A
      UKMEC table gives "diastolic ≥ 95" under a heading that says
      mmHg, and "HbA1c >41" without mmol/mol. Accepted when the source
      has the number with no unit after it; refused when the source
      puts a different unit after it, which is the 14 days and 14 weeks
      case.
    */
    // Two digits at least, and not one end of a range: a bare "4" turns
    // up in "days 4-14" and would have passed Q2028's "four hours", the
    // very figure this check was written to catch.
    if (unit && value.replace(/\D/g, "").length >= 2) {
      // A minus sign is not a range: "MD -0.02" states 0.02, "4-14" does
      // not state 14 on its own. So a dash is refused only after a digit.
      const bare = new RegExp(
        `(?<![0-9.])(?<!\\d-)${value.replace(/[.+]/g, (c) => `\\${c}`)}(?![0-9.\\-])(?!\\s*(?:${UNITS})(?![a-z]))`
      );
      if (bare.test(haystack)) continue;
    }

    /*
      A round number the explanation itself marks as approximate: "over
      124 000" for a study of 124 215, "over 63 000" for 63 108. Accepted
      when a source number lies within ten per cent of it, and only for
      numbers of a thousand or more, where rounding is what a writer
      does; a rounded 45% from an RR of 0.55 is not this, and is still
      refused.
    */
    const qualifier = /(over|more than|approximately|about|around|nearly|almost|>|≥)\s*$/.test(before);
    const n = Number(value);
    if (qualifier && !unit && n >= 1000) {
      const nums = haystack.match(/\d+(?:\.\d+)?/g) ?? [];
      if (nums.some((x) => Math.abs(Number(x) - n) / n <= 0.1)) continue;
    }

    missing.add(full);
  }

  return Array.from(missing).map(
    (f) =>
      `the explanation states "${f}", which no cited passage contains: cite the passage it came from, or take it out`
  );
}

/**
 * figureGroundingProblems for a generated question: the passages it
 * cites, plus what it asks, since a vignette's own numbers are fair to
 * repeat. Only cited passages count. A figure from a passage that was
 * retrieved but not cited is the Q2028 fault, and the retry message
 * tells the model to cite it.
 */
export function citedFigureProblems(
  explanations: { text: string; citation_chunk_ids: number[] }[],
  citedIds: number[],
  passages: RetrievedChunk[],
  asked: string[]
): string[] {
  const cited = new Set([...citedIds, ...explanations.flatMap((e) => e.citation_chunk_ids)]);
  const sources = [
    ...passages.filter((p) => cited.has(p.chunk_id)).map((p) => p.text),
    ...asked,
  ];
  return figureGroundingProblems(explanations.map((e) => e.text).join("\n"), sources);
}

/**
 * A ratio in what is ASKED: the stem or an option.
 *
 * The rule agreed in review is that the relative risk and its
 * confidence interval belong in the explanation, where they teach, and
 * out of the question, where they only test recall of a point estimate
 * to two decimal places. So this is given the stem and the options and
 * nothing else.
 *
 * An earlier version read the explanation and demanded an absolute
 * figure beside any ratio there. That inverted the rule: it flagged
 * explanations doing exactly what they should, and pushed repairs
 * towards absolute risks the passages never state, which is the
 * computed arithmetic the grounding checker exists to refuse.
 */
export function ratioInQuestionProblems(asked: string): string[] {
  const ratio =
    /\b(OR|RR|HR)\s*[=:]?\s*\d/.test(asked) ||
    /\b(odds ratio|relative risk|hazard ratio)\b/i.test(asked);
  if (!ratio) return [];
  return [
    "the question asks for a ratio (OR, RR or HR): ask for the magnitude in clinical words, \"approximately halved\", and keep the ratio in the explanation",
  ];
}

/**
 * The answer said aloud in the stem.
 *
 * A stem containing every content word of its own correct option has
 * stopped being a question. Compared on content words so a technique
 * named in the vignette is caught, while an incidental article is not.
 */
export function answerInStemProblems(
  stem: string,
  options: { key: string; text: string }[],
  correctKey: string
): string[] {
  const STOP = new Set([
    "the", "and", "with", "for", "from", "that", "this", "her", "his",
    "she", "would", "should", "most", "appropriate", "next", "step",
    "management", "woman", "weeks", "year", "years", "old", "which",
    "what", "following", "been", "have", "has", "was", "were",
  ]);
  const words = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    );

  const correct = options.find((o) => o.key === correctKey);
  if (!correct) return [];
  const inOption = Array.from(words(correct.text));
  if (inOption.length < 2) return [];

  const inStem = words(stem);
  if (!inOption.every((w) => inStem.has(w))) return [];
  return [
    `the stem already contains every content word of the correct option (${inOption.join(", ")}): it answers itself`,
  ];
}

/**
 * An option that is a sentence rather than a thing.
 *
 * An option list is a list of items a candidate chooses between: a
 * drug, a dose, an investigation, a step. Once an option becomes a
 * sentence it carries its own reasoning, it stops being comparable
 * with its neighbours, and the list stops being homogeneous, which is
 * what lets a scenario be answered by spotting the right shape rather
 * than knowing the medicine.
 */
export function optionSentenceProblems(
  options: { key: string; text: string }[]
): string[] {
  const problems: string[] = [];
  for (const o of options) {
    const words = o.text.trim().split(/\s+/).length;
    if (/^(inform|reassure|tell|advise|explain)\b/i.test(o.text)) {
      problems.push(
        `option ${o.key} is an instruction to counsel rather than a clinical item: "${o.text}"`
      );
    } else if (words > OPTION_MAX_WORDS) {
      problems.push(
        `option ${o.key} runs to ${words} words: an option is an item, not a sentence ("${o.text}")`
      );
    }
  }
  return problems;
}

/**
 * Beyond this an option has stopped being an item and become a claim.
 *
 * Set from the approved bank rather than from taste. Across its 4,550
 * EMQ options the median is four words and the 90th percentile nine;
 * nine as a hard limit would have failed 144 of 396 approved sets and
 * had the generator discarding a third of what it wrote, most of it
 * for legitimate items such as a full steroid regimen. Twelve catches
 * the outliers, about 2% of options, which is where an item has become
 * a sentence. The counselling-instruction check above is separate and
 * stays absolute: "Inform the woman..." is never an item at any length.
 */
const OPTION_MAX_WORDS = 12;

export function verifyQuestion(
  q: GeneratedQuestion,
  retrievedIds: Set<number>
): string[] {
  const problems: string[] = [];

  if (!q.stem.trim()) problems.push("empty stem");
  if (q.options.length < 2) problems.push("fewer than two options");
  if (!q.options.some((o) => o.key === q.correct_key))
    problems.push("correct_key does not match any option");

  // One explanation, for the answer. Explaining four distractors taught
  // nothing a candidate carries into the exam, and the card never
  // showed it — the exemplars carry a single rationale, and so do we.
  if (!q.explanations.some((e) => e.key === q.correct_key)) {
    problems.push("the correct option has no explanation");
  }
  for (const e of q.explanations) {
    if (e.key !== q.correct_key) {
      problems.push(`option ${e.key} is not the answer and must not be explained`);
    }
  }

  // Every cited chunk id is in the retrieved set.
  const badCites = new Set<number>();
  for (const e of q.explanations) {
    for (const id of e.citation_chunk_ids) {
      if (!retrievedIds.has(id)) badCites.add(id);
    }
  }
  if (badCites.size > 0) {
    problems.push(`invalid citations: ${Array.from(badCites).join(", ")}`);
  }
  // Grounding: the correct option must cite at least one passage.
  const correct = q.explanations.find((e) => e.key === q.correct_key);
  if (!correct || correct.citation_chunk_ids.length === 0) {
    problems.push("correct option has no citation");
  }

  // The one explanation is what the candidate reads. Without it the
  // question reveals its answer and explains nothing.
  if (!correct?.text.trim()) {
    problems.push("the correct option's explanation is empty");
  }

  // Everything stored is now read by the candidate — there is no
  // admin-only working left to hold to a looser standard.
  const question = [q.stem, ...q.options.map((o) => o.text)].join("\n");
  const candidateText = [
    question,
    q.explanation,
    ...q.explanations.map((e) => e.text),
  ].join("\n");

  problems.push(...ukEnglishProblems(candidateText));
  problems.push(...sourceNarrationProblems(candidateText));
  problems.push(...selfTalkProblems(candidateText));
  problems.push(...emDashProblems(candidateText));
  problems.push(...listRecallProblems(q.stem));
  // A single-best-answer needs options that are alternatives to one
  // another, not one option and a qualified restatement of it.
  problems.push(...overlappingOptionProblems(q.options));
  problems.push(...optionJustificationProblems(q.options));
  problems.push(...optionSentenceProblems(q.options));
  // A stem that names its own answer has stopped being a question.
  problems.push(...answerInStemProblems(q.stem, q.options, q.correct_key));
  // A ratio is taught under the answer, never asked for.
  problems.push(
    ...ratioInQuestionProblems(
      [q.stem, ...q.options.map((o) => o.text)].join("\n")
    )
  );
  // The evidence may be named under the answer, never in the question
  // being asked.
  problems.push(...studyAttributionProblems(question));
  problems.push(...studySubjectProblems(q.stem));
  // The card shows one paragraph, so the explanation has to be one.
  if (correct?.text) problems.push(...explanationLengthProblems(correct.text));
  // Subspecialty jargon a general trainee cannot parse. Enforceable
  // only now that its everyday list has been through the owner: it
  // flagged 562 of 1200 while it held nineteen terms, which is a lint
  // reporting the bank rather than the exceptions.
  problems.push(
    ...unexpandedAbbreviations(candidateText).map(
      (a) =>
        `"${a}" is never written out: give it in full on first use with the short form in brackets after it, then the short form alone`
    )
  );

  return problems;
}

/**
 * A table under an explanation is a set of factual claims, so it is
 * held to the same rule as the rest: every cell has to come from the
 * passages. A plausible extra row is exactly the failure this catches —
 * it reads as authoritative and nothing in the prose gives it away.
 */
export function tableProblems(
  table: ExplanationTable | null,
  passages: RetrievedChunk[]
): string[] {
  if (!table) return [];
  const bad = ungroundedCells(table, passages.map((p) => p.text));
  return bad.length > 0
    ? [
        `explanation table has cells not in the passages: ${bad.slice(0, 5).join(", ")}`,
      ]
    : [];
}

/**
 * Quantities whose bands a highlighted row can be checked against.
 * `label` matches the row's first cell — the convention in these
 * tables is that it names the risk factor — and `value` reads the
 * patient's own figure out of the stem.
 *
 * Deliberately three. Gestation looks like a fourth but is not: a row
 * saying "consider planned birth at 38-39 weeks" carries a gestation
 * that is a target, not a description of the woman in front of you,
 * and checking it flags correct questions.
 */
const BANDED_QUANTITIES: {
  name: string;
  label: RegExp;
  value: (stem: string) => number[];
}[] = [
  {
    name: "age",
    label: /\bage\b/i,
    value: (stem) => {
      const out: number[] = [];
      const re = /(\d{1,3})\s*(?:-|\s)\s*year\s*(?:-|\s)\s*old/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stem))) out.push(Number(m[1]));
      const aged = stem.match(/\baged\s+(\d{1,3})\b/i);
      if (aged) out.push(Number(aged[1]));
      return out;
    },
  },
  {
    name: "BMI",
    label: /\bBMI\b|body mass index/i,
    value: (stem) => {
      const out: number[] = [];
      const re = /BMI\s*(?:of|is|was|=|at)?\s*(\d{2}(?:\.\d)?)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stem))) out.push(Number(m[1]));
      return out;
    },
  },
  {
    name: "duration of surgery",
    label: /duration|operative time|surgical time|anaesthetic time/i,
    value: (stem) => {
      const out: number[] = [];
      const re = /(\d{1,4})\s*(?:minutes?|mins?)\b/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stem))) out.push(Number(m[1]));
      return out;
    },
  },
];

const BAND_OPS =
  "≥|>=|>|≤|<=|<|at least|no less than|over|under|below|above|more than|less than|older than|younger than";

/** Does the patient's figure fall in a band written as "41-60"? */
function inBand(text: string, values: number[]): boolean | null {
  const range = text.match(
    /(\d{1,4}(?:\.\d{1,2})?)\s*(?:[‐-―−-]|\s+to\s+)\s*(\d{1,4}(?:\.\d{1,2})?)/
  );
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return values.some((v) => v >= lo && v <= hi);
  }
  const threshold = text.match(new RegExp("(" + BAND_OPS + ")\\s*(\\d{1,4}(?:\\.\\d{1,2})?)", "i"));
  if (!threshold) return null;
  const op = threshold[1].toLowerCase();
  const n = Number(threshold[2]);
  return values.some((v) => {
    switch (op) {
      case "≥":
      case ">=":
      case "at least":
      case "no less than":
        return v >= n;
      case ">":
      case "over":
      case "above":
      case "more than":
      case "older than":
        return v > n;
      case "≤":
      case "<=":
        return v <= n;
      default:
        return v < n;
    }
  });
}

/**
 * A highlighted row is the question pointing at a band and saying
 * "this one is hers". If she falls outside it, the question has scored
 * the wrong row — and where the answer is the total, it is now keyed
 * to a number the candidate cannot reach.
 *
 * Question 1153 said a 58-year-old and applied the 61-74 band (+2).
 * Scored on its own source table she totalled 4, but 5 was marked
 * correct: a candidate who got it right was told they were wrong.
 * Nothing else in this layer compares a number in the stem with the
 * way the explanation treats it.
 */
export function appliedBandProblems(
  stem: string,
  table: ExplanationTable | null
): string[] {
  if (!table?.highlight?.length) return [];
  const problems: string[] = [];
  for (const index of table.highlight) {
    const row = table.rows[index];
    if (!row?.length) continue;
    for (const quantity of BANDED_QUANTITIES) {
      if (!quantity.label.test(row[0])) continue;
      const values = quantity.value(stem);
      if (!values.length) continue;
      const band = row.slice(1).find((cell) => inBand(cell, values) !== null);
      if (band === undefined) continue;
      if (inBand(band, values) === false) {
        problems.push(
          `the stem gives ${quantity.name} ${values.join(" and ")}, but the highlighted row applies "${row[0]} ${band}", either the stem or the row is wrong, and if the answer is a total it is now keyed to the wrong number`
        );
      }
    }
  }
  return problems;
}

/**
 * Independent grounding check (verification layer, not one of the
 * canonical AI-PROMPTS.md prompts). A second pass must point at the
 * exact sentence in the cited passages that establishes the correct
 * answer. The quote is then checked by literal substring match against
 * the passage text, so an invented justification cannot pass: the
 * model would have to quote words that genuinely appear in the source.
 */
const GROUNDING_PROMPT = `You are a strict fact-checker for exam questions. You are given SOURCE PASSAGES, a question, and the answer marked correct.

Decide ONE thing: do the passages explicitly establish that the marked answer is correct?

Work in this order.

1. Say to yourself exactly what the question asks for, which quantity, in which direction, about whom. "What percentage will become pregnant" and "what percentage will not become pregnant" are different questions with different answers.
2. Find the sentence in the passages that gives THAT.
3. Check the marked answer is what that sentence gives.

The commonest way a question is wrong is that the number is in the passages but attached to the opposite quantity. Watch for: effectiveness against failure rate, survival against mortality, sensitivity against specificity, continuation against discontinuation, a risk against a risk reduction, and any pair that sums to 100%. A table headed "Typical use effectiveness (%)" does not answer "what percentage become pregnant", the answer to that is what is left when you take the figure from 100, and unless the passages state that remainder themselves, they do not establish it. Answer supported: false.

- Quote VERBATIM the sentence (or clause) from the passages that establishes it. Copy it exactly, character for character, from the passage text. Do not paraphrase, correct, translate or shorten it with ellipses.
- Quote the sentence or clause that carries the point and stop there, at most about 300 characters. Some passages are poorly extracted and run headings and page furniture into the prose; take the part that establishes the answer, not everything that follows it.
- If the passages only imply it, require outside clinical knowledge, or do not address it at all, answer supported: false.
- Being clinically true is NOT enough. It must be stated in these passages.

Respond with ONLY this JSON, no fences:
{"supported": true, "chunk_id": 12, "quote": "exact sentence copied from the passage"}
or
{"supported": false, "reason": "one short sentence"}`;

/** Comparison form: lowercase, punctuation and spacing flattened. */
function flatten(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Shortest quote we'll accept as real evidence. */
const MIN_QUOTE_CHARS = 25;
/** Words a quote must share with the passage to count as quoted. */
const QUOTE_OVERLAP = 0.8;
const MIN_QUOTE_WORDS = 6;

/**
 * How long a model call may take before it must give up.
 *
 * Sizing the work was not enough. Four runs of the same three-scenario
 * EMQ section took 33.7s, 53.8s, 65.4s and 98.5s: the variance is in
 * how long the model takes to answer, not in how much it is asked for,
 * so no set is small enough to be safe. A request that overruns the
 * host's limit is killed, which returns an HTML 504, records nothing,
 * and loses every scenario it had already verified.
 *
 * Bounding the calls instead means the worst case is a run that
 * reports it made nothing — recorded, returned as JSON, and followed
 * immediately by the next run. Slow is survivable; killed is not.
 */
/**
 * Never leave a call so little time that it cannot succeed. A one
 * second floor was worse than no bound at all: generation would use
 * most of the budget, every grounding check that followed would get
 * the floor, and all of them would time out at once — reported as
 * "grounding check failed: Request timed out" on three scenarios of a
 * set that had actually been generated fine.
 */
const MIN_CALL_MS = 8_000;

/**
 * Time held back from generation so the checks that follow it have
 * some. Generation is one call and grounding is one per scenario run
 * together, so the reserve is sized for the slower of those rather
 * than for their sum.
 *
 * Both numbers are a squeeze, and the first attempt got it wrong in
 * the other direction: reserving 15 of 45 seconds left generation 30,
 * which is less than an EMQ set often needs, so the timeouts simply
 * moved from the checks to the generation. The budget is now 52
 * seconds against the route's 60, split 40 and 12.
 */
const GROUNDING_RESERVE_MS = 12_000;

function callOptions(hardDeadline: number | undefined, reserveMs = 0) {
  if (!hardDeadline) return {};
  return {
    timeout: Math.max(MIN_CALL_MS, hardDeadline - Date.now() - reserveMs),
    // The SDK retries a timed-out request twice by default, so a
    // timeout is a floor on the wait rather than a ceiling: a 50-second
    // bound produced a 96-second call. Here the queue is the retry —
    // the page calls the worker again the moment it returns — so one
    // attempt that gives up on time is worth more than three that
    // overrun together and lose the run.
    maxRetries: 0,
  };
}

/**
 * How long a cached prefix survives. Five minutes is the default and
 * the right one here: the worker fires again the moment it returns, an
 * attempt's retries are seconds apart, and grounding follows generation
 * within the same request, so nothing waits long enough to need an
 * hour. The hour costs twice as much to write rather than a quarter
 * more, so it only pays where the same prefix recurs after a long gap
 * — set ANTHROPIC_CACHE_TTL=1h if the queue is ever run in bursts far
 * apart.
 */
const CACHE_TTL: "5m" | "1h" = process.env.ANTHROPIC_CACHE_TTL === "1h" ? "1h" : "5m";

/**
 * The shortest prefix the API will cache: 1024 tokens, or 2048 for
 * Haiku. Below it a cache_control block is accepted and does nothing,
 * which is worse than not writing one — it reads as caching that
 * isn't happening. So the marker goes on only where it can take
 * effect, and everything else is left as a plain string on purpose.
 */
function minCacheableTokens(model: string): number {
  return /haiku/i.test(model) ? 2048 : 1024;
}

/** Rough, and deliberately cautious: better to skip a marginal prefix
 *  than to claim a cache that never forms. */
const CHARS_PER_TOKEN = 3.6;

/**
 * A system prompt, marked as a cache breakpoint when it is long enough
 * to be worth one.
 *
 * Only the system prompt is cached. The user message leads with the
 * source passages, which differ on every call, so its prefix never
 * repeats and a breakpoint there would pay the write premium for
 * nothing. Reordering it to put the stable style examples first would
 * open that up, but that changes what the model reads and cannot be
 * evaluated while the API is unavailable.
 */
export function cacheableSystem(
  text: string,
  model: string
): string | Anthropic.TextBlockParam[] {
  if (text.length < minCacheableTokens(model) * CHARS_PER_TOKEN) return text;
  return [{ type: "text", text, cache_control: { type: "ephemeral", ttl: CACHE_TTL } }];
}

/**
 * Does this quote genuinely come from the passage?
 *
 * An exact substring match is the ideal, but PDF-extracted guidance is
 * full of hyphenation, ligatures, table spacing and line breaks that
 * survive flattening, so a faithful quote often fails it. The fallback
 * keeps the guarantee that matters:
 *
 * - EVERY number in the quote must appear in the passage. Invented
 *   figures — the dangerous hallucination in clinical revision — are
 *   rejected outright, however well the prose matches.
 * - The wording must overlap heavily, so a plausible-sounding sentence
 *   assembled from the model's own knowledge cannot pass.
 */
export function quoteIsFromPassage(quote: string, passage: string): boolean {
  const flatQuote = flatten(quote);
  const flatPassage = flatten(passage);
  if (flatQuote.length < MIN_QUOTE_CHARS) return false;

  if (flatPassage.includes(flatQuote)) return true;

  const quoteWords = flatQuote.split(" ").filter(Boolean);
  if (quoteWords.length < MIN_QUOTE_WORDS) return false;
  const passageWords = new Set(flatPassage.split(" ").filter(Boolean));

  // Any figure the passage doesn't contain means the quote is invented
  // or altered — exactly the failure this check exists to catch.
  for (const word of quoteWords) {
    if (/\d/.test(word) && !passageWords.has(word)) return false;
  }

  const shared = quoteWords.filter((w) => passageWords.has(w)).length;
  return shared / quoteWords.length >= QUOTE_OVERLAP;
}

/** A question's figure, in the words the app reads it aloud with. */
function describeFigure(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "cystometrogram") return null;
  const trace = parseCystometrogram(raw);
  return trace ? describeCystometrogram(trace) : null;
}

export async function checkGrounding(
  question: GeneratedQuestion,
  passages: RetrievedChunk[],
  client: Anthropic,
  model: string,
  hardDeadline?: number
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const correctOption = question.options.find(
    (o) => o.key === question.correct_key
  );
  if (!correctOption) return { ok: false, reason: "no correct option" };

  const cited = new Set(
    question.explanations.find((e) => e.key === question.correct_key)
      ?.citation_chunk_ids ?? []
  );
  const citedPassages = passages.filter((p) => cited.has(p.chunk_id));
  if (citedPassages.length === 0) {
    return { ok: false, reason: "correct option cites no passage" };
  }

  /*
    A question read from a figure keeps half its evidence in the
    figure, and the check cannot see pictures. #2015 shows a trace with
    a leak on a cough and a leak on an unprovoked detrusor contraction,
    and the check refused it with "the answer depends on interpreting a
    cystometry trace image that is not reproduced in the passages" —
    which was true, and the fault was ours: the trace was never sent.
    It is described in words for exactly this, so the description goes
    with the stem.
  */
  const figure = describeFigure((question as { figure?: unknown }).figure);
  const userMessage = `SOURCE PASSAGES:\n${formatPassages(citedPassages)}\n\nQUESTION:\n${question.stem}${figure ? `\n\nTHE FIGURE SHOWN WITH THE QUESTION:\n${figure}` : ""}\n\nMARKED CORRECT ANSWER:\n${correctOption.key}. ${correctOption.text}`;

  let raw = "";
  try {
    const response = await client.messages.create({
      model,
      // Enough for a long quote out of a badly chunked document. At
      // 1024 a quote from OCR that runs page furniture into the prose
      // ("...a 1 Scheduled care STANDARD 30 16 STANDARD 38...") ran the
      // JSON past the limit, and a truncated verdict was being read as
      // a failed one.
      max_tokens: 2048,
      system: GROUNDING_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }, callOptions(hardDeadline));
    const block = response.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
  } catch (error) {
    return {
      ok: false,
      reason: `grounding check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let verdict: { supported?: unknown; quote?: unknown; reason?: unknown };
  try {
    verdict = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: "grounding check returned unreadable JSON" };
  }

  if (verdict.supported !== true) {
    const why =
      typeof verdict.reason === "string" && verdict.reason.trim()
        ? verdict.reason.trim()
        : "the passages do not establish the marked answer";
    return { ok: false, reason: `not grounded: ${why}` };
  }

  const quote = typeof verdict.quote === "string" ? verdict.quote.trim() : "";
  if (flatten(quote).length < MIN_QUOTE_CHARS) {
    return { ok: false, reason: "supporting quote too short to verify" };
  }

  // The decisive test: the quote must genuinely come from a cited
  // passage — every figure present, and the wording overlapping.
  const found = citedPassages.some((p) => quoteIsFromPassage(quote, p.text));
  if (!found) {
    return {
      ok: false,
      reason: "supporting quote does not appear in the cited passages",
    };
  }

  return { ok: true };
}

/** A, B, C … for however many options a set needs. */
export function optionKey(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * Put the options in the order the exam puts them.
 *
 * The RCOG spec is explicit: options "will nearly always be listed in
 * alphabetical or numerical order for ease of reference". The exemplar
 * bank follows that 84% of the time. This used to shuffle instead,
 * which served the same purpose — the correct answer must not sit on a
 * predictable letter — but produced lists no real paper would print,
 * and made a twelve-option EMQ list harder to scan than the real thing.
 *
 * Sorting achieves the anti-bias goal just as well, and for the same
 * reason: a letter is decided by the option's own text, which has
 * nothing to do with whether it is the answer.
 *
 * Numerical when every option carries a number — "10 mg", "2%",
 * "34 weeks" — because alphabetising those puts 10 before 9.
 *
 * Returns the new options and an old-key → new-key map.
 */
export function orderOptions(options: QuestionOption[]): {
  options: QuestionOption[];
  remap: Map<string, string>;
} {
  const leadingNumber = (text: string): number | null => {
    const m = text.match(/-?\d+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = Number(m[0].replace(",", ""));
    return Number.isFinite(n) ? n : null;
  };

  const numbers = options.map((o) => leadingNumber(o.text));
  const allNumeric = numbers.every((n) => n !== null);

  const sorted = options
    .map((option, i) => ({ option, i }))
    .sort((a, b) => {
      if (allNumeric) {
        const d = (numbers[a.i] as number) - (numbers[b.i] as number);
        if (d !== 0) return d;
      }
      return a.option.text.localeCompare(b.option.text, "en", {
        sensitivity: "base",
      });
    });

  const remap = new Map<string, string>();
  const ordered = sorted.map(({ option }, position) => {
    const newKey = optionKey(position);
    remap.set(option.key, newKey);
    return { key: newKey, text: option.text };
  });

  return { options: ordered, remap };
}

/** Apply a key remap to one question's answer and explanations. */
function applyRemap<T extends { key: string }>(
  correctKey: string,
  explanations: T[],
  remap: Map<string, string>
): { correctKey: string; explanations: T[] } {
  return {
    correctKey: remap.get(correctKey) ?? correctKey,
    explanations: explanations.map((e) => ({
      ...e,
      key: remap.get(e.key) ?? e.key,
    })),
  };
}

/** Letter an SBA's options in the exam's order. */
export function orderQuestionOptions(
  question: GeneratedQuestion
): GeneratedQuestion {
  const { options, remap } = orderOptions(question.options);
  const { correctKey, explanations } = applyRemap(
    question.correct_key,
    question.explanations,
    remap
  );
  return { ...question, options, correct_key: correctKey, explanations };
}

/* ===================== EMQ sets ===================== */

export type GeneratedEmqScenario = {
  stem: string;
  correct_key: string;
  /**
   * The correct option's explanation, and nothing else — an EMQ has one
   * per scenario, and it is what the candidate reads. SBAs carry a
   * separate combined paragraph because they explain five options; an
   * EMQ explaining one would only say the same thing twice.
   */
  explanations: GeneratedExplanation[];
  citation_chunk_ids: number[];
};

export type GeneratedEmqSet = {
  lead_in: string;
  options: QuestionOption[];
  scenarios: GeneratedEmqScenario[];
  difficulty: number;
  coverage_note: string;
};

/**
 * A real EMQ has a long shared list, not five options. The RCOG says
 * most of its option lists run to 10-14, which is what the generator
 * asks for and what all 53 sets in the bank already have; the band is
 * a little wider so a set that comes back with one option short or
 * long is kept rather than thrown away.
 */
export const EMQ_MIN_OPTIONS = 9;
export const EMQ_MAX_OPTIONS = 15;
/**
 * The RCOG publishes its EMQ examples as one option list with one
 * scenario, and marks each scenario as its own question among the
 * fifty, so a short set is not a malformed one. The floor is here to
 * stop a "set" that is really a single question dressed up, not to
 * impose a shape the exam does not have — and at three it was
 * throwing away sets that had lost one scenario to the grounding
 * check, which on a three-scenario set is a total loss.
 */
export const EMQ_MIN_SCENARIOS = 2;

function parseEmqSet(raw: string):
  | { set: GeneratedEmqSet }
  | { insufficient: true }
  | { parseError: string } {
  const cleaned = extractJson(raw);
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : "bad JSON" };
  }
  if (typeof data !== "object" || data === null) {
    return { parseError: "response was not a JSON object" };
  }
  const obj = data as Record<string, unknown>;
  if (obj.error === "insufficient_source_material") return { insufficient: true };

  const options = Array.isArray(obj.options)
    ? (obj.options as unknown[]).flatMap((o) => {
        if (typeof o !== "object" || o === null) return [];
        const oo = o as Record<string, unknown>;
        if (typeof oo.key !== "string" || typeof oo.text !== "string") return [];
        return [{ key: oo.key.trim().toUpperCase(), text: oo.text.trim() }];
      })
    : [];

  const scenarios = Array.isArray(obj.scenarios)
    ? (obj.scenarios as unknown[]).flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const ss = s as Record<string, unknown>;
        if (typeof ss.stem !== "string" || typeof ss.correct_key !== "string") {
          return [];
        }
        const explanations = Array.isArray(ss.explanations)
          ? (ss.explanations as unknown[]).flatMap((e) => {
              if (typeof e !== "object" || e === null) return [];
              const ee = e as Record<string, unknown>;
              if (typeof ee.key !== "string" || typeof ee.text !== "string") {
                return [];
              }
              const cites = Array.isArray(ee.citation_chunk_ids)
                ? (ee.citation_chunk_ids as unknown[])
                    .map((n) => Number(n))
                    .filter((n) => Number.isFinite(n))
                : [];
              return [
                {
                  key: ee.key.trim().toUpperCase(),
                  verdict:
                    ee.verdict === "correct"
                      ? ("correct" as const)
                      : ("incorrect" as const),
                  text: ee.text,
                  citation_chunk_ids: cites,
                  source_reference:
                    typeof ee.source_reference === "string"
                      ? ee.source_reference
                      : "",
                },
              ];
            })
          : [];
        return [
          {
            stem: ss.stem,
            correct_key: ss.correct_key.trim().toUpperCase(),
            explanations,
            citation_chunk_ids: Array.from(
              new Set(explanations.flatMap((e) => e.citation_chunk_ids))
            ),
          },
        ];
      })
    : [];

  return {
    set: {
      lead_in: typeof obj.lead_in === "string" ? obj.lead_in : "",
      options,
      scenarios,
      difficulty:
        typeof obj.difficulty === "number" ? Math.round(obj.difficulty) : 3,
      coverage_note:
        typeof obj.coverage_note === "string" ? obj.coverage_note : "",
    },
  };
}

type PublicationPattern = { re: RegExp; label: string };

/**
 * Words that mark a publication rather than a clinical item. Matched
 * against the lead-in, every option and every stem.
 */
const PUBLICATION_PATTERNS: PublicationPattern[] = [
  { re: /\barticles?\b/i, label: "article" },
  { re: /\bjournals?\b/i, label: "journal" },
  { re: /\bpublications?\b/i, label: "publication" },
  { re: /\beditorials?\b/i, label: "editorial" },
  { re: /\bchapters?\b/i, label: "chapter" },
  { re: /\btextbooks?\b/i, label: "textbook" },
  { re: /\bTOG\b/, label: "TOG" },
];

/**
 * Additionally banned in options, where naming a guidance document is
 * the same defect. Not applied to the lead-in or stems, where "as per
 * RCOG guidance" is ordinary exam phrasing.
 */
const GUIDANCE_TITLE_PATTERNS: PublicationPattern[] = [
  { re: /\bguidelines?\b/i, label: "guideline" },
  { re: /\bguidance\b/i, label: "guidance" },
  { re: /green[\s-]?top/i, label: "Green-top" },
  { re: /\bGTG\b/, label: "GTG" },
];

/**
 * Reject a set that tests which publication covers a subject instead
 * of clinical knowledge.
 *
 * TOG is legitimate source material (priority 2), but some TOG pieces —
 * "Spotlight on..." editorials, correspondence, contents summaries —
 * are little more than annotated lists of article titles. Given those
 * passages the model builds an option list out of the titles and asks
 * which article covers what, which is not examined in MRCOG and is not
 * salvageable by regenerating from the same material.
 */
export function publicationReferenceProblems(set: GeneratedEmqSet): string[] {
  const problems: string[] = [];
  const match = (patterns: PublicationPattern[], text: string) =>
    patterns.find((p) => p.re.test(text))?.label;

  const inLeadIn = match(PUBLICATION_PATTERNS, set.lead_in);
  if (inLeadIn) {
    problems.push(
      `lead-in refers to a "${inLeadIn}": it must ask for a clinical decision, not for a publication`
    );
  }

  for (const option of set.options) {
    const term = match(
      [...PUBLICATION_PATTERNS, ...GUIDANCE_TITLE_PATTERNS],
      option.text
    );
    if (term) {
      problems.push(
        `option ${option.key} refers to a "${term}": options must be clinical items, diagnoses, investigations, drugs, management steps, thresholds, never document titles`
      );
    }
  }

  set.scenarios.forEach((scenario, i) => {
    const term = match(PUBLICATION_PATTERNS, scenario.stem);
    if (term) {
      problems.push(
        `scenario ${i + 1} refers to a "${term}": the vignette must be about managing a patient, not about choosing something to read`
      );
    }
  });

  return problems;
}

/**
 * Verify an EMQ set is genuinely an EMQ: a long shared option list, a
 * lead-in, and several scenarios answered from that list — not an SBA
 * wearing more options.
 */
export function verifyEmqSet(
  set: GeneratedEmqSet,
  retrievedIds: Set<number>
): string[] {
  const problems: string[] = [];

  if (!set.lead_in.trim()) problems.push("missing lead-in");
  if (set.options.length < EMQ_MIN_OPTIONS) {
    problems.push(
      `only ${set.options.length} options (an EMQ needs at least ${EMQ_MIN_OPTIONS})`
    );
  }
  if (set.options.length > EMQ_MAX_OPTIONS) {
    problems.push(`${set.options.length} options exceeds ${EMQ_MAX_OPTIONS}`);
  }
  if (set.scenarios.length < EMQ_MIN_SCENARIOS) {
    problems.push(
      `only ${set.scenarios.length} scenario(s) (an EMQ set needs at least ${EMQ_MIN_SCENARIOS})`
    );
  }

  const keys = new Set(set.options.map((o) => o.key));
  if (keys.size !== set.options.length) problems.push("duplicate option keys");

  // Two scenarios may share an answer. The RCOG's own description of
  // the paper says an option list recurs "with different tested
  // scenarios", and each scenario is marked as its own question among
  // the fifty — so nothing in the real exam stops the same option
  // being the best fit twice. Requiring otherwise was our invention,
  // and an expensive one: it failed whole sets on the Contraception
  // bank repeatedly, throwing away three good scenarios because a
  // fourth landed on an answer already used.
  //
  // What stops a set being repetitive is not enforced here but in the
  // prompt, which requires scenarios to test different knowledge
  // points. That is the real requirement; identical answers to
  // genuinely different questions were never the problem.
  for (let i = 0; i < set.scenarios.length; i++) {
    const scenario = set.scenarios[i];
    const label = `scenario ${i + 1}`;
    if (!scenario.stem.trim()) problems.push(`${label}: empty stem`);
    if (!keys.has(scenario.correct_key)) {
      problems.push(`${label}: answer is not in the option list`);
    }

    const correct = scenario.explanations.find(
      (e) => e.key === scenario.correct_key
    );
    if (!correct) {
      problems.push(`${label}: correct option has no explanation`);
    } else if (correct.citation_chunk_ids.length === 0) {
      problems.push(`${label}: correct option has no citation`);
    }
    const bad = scenario.explanations
      .flatMap((e) => e.citation_chunk_ids)
      .filter((id) => !retrievedIds.has(id));
    if (bad.length > 0) {
      problems.push(`${label}: invalid citations ${Array.from(new Set(bad)).join(", ")}`);
    }
  }

  // As for SBAs: house style is judged on what the candidate reads,
  // while the per-option working only has to be UK English.
  const candidateText = [
    set.lead_in,
    ...set.options.map((o) => o.text),
    ...set.scenarios.flatMap((s) => [
      s.stem,
      // The correct option's explanation is what the candidate reads on
      // an EMQ, so it is held to house style, not merely to UK English.
      s.explanations.find((e) => e.key === s.correct_key)?.text ?? "",
    ]),
  ].join("\n");
  const blob = [
    candidateText,
    ...set.scenarios.flatMap((s) => s.explanations.map((e) => e.text)),
  ].join("\n");
  problems.push(...ukEnglishProblems(blob));
  problems.push(...sourceNarrationProblems(candidateText));
  problems.push(...selfTalkProblems(blob));
  problems.push(...emDashProblems(blob));
  problems.push(...publicationReferenceProblems(set));
  // The option list is a list of items. Once an option becomes a
  // sentence the list stops being homogeneous, and a scenario can be
  // answered by spotting the only option of the right shape.
  problems.push(...optionSentenceProblems(set.options));
  for (const scenario of set.scenarios) {
    problems.push(
      ...answerInStemProblems(scenario.stem, set.options, scenario.correct_key)
    );
  }
  const asked = [
    set.lead_in,
    ...set.options.map((o) => o.text),
    ...set.scenarios.map((s) => s.stem),
  ].join("\n");
  // A ratio is taught under the answer, never asked for.
  problems.push(...ratioInQuestionProblems(asked));
  problems.push(...listRecallProblems(asked));
  // Named evidence belongs under the answer, not in what is asked.
  problems.push(...studyAttributionProblems(asked));
  problems.push(...studySubjectProblems(asked));
  // Each scenario's card shows one paragraph, same as an SBA's.
  for (const s of set.scenarios) {
    const correct = s.explanations.find((e) => e.key === s.correct_key);
    if (correct?.text) problems.push(...explanationLengthProblems(correct.text));
  }

  return problems;
}

/** Order the shared list, remapping every scenario's answer to match. */
export function orderEmqOptions(set: GeneratedEmqSet): GeneratedEmqSet {
  const { options, remap } = orderOptions(set.options);
  return {
    ...set,
    options,
    scenarios: set.scenarios.map((s) => {
      const { correctKey, explanations } = applyRemap(
        s.correct_key,
        s.explanations,
        remap
      );
      return { ...s, correct_key: correctKey, explanations };
    }),
  };
}

export type EmqOutcome =
  | { status: "ok"; set: GeneratedEmqSet; attempts: number }
  | { status: "insufficient" }
  | { status: "flagged"; reason: string; raw: string };

export type GenerationOutcome =
  | { status: "ok"; question: GeneratedQuestion; attempts: number }
  | { status: "insufficient" }
  | { status: "flagged"; reason: string; raw: string };

/**
 * A retry that re-sends the same prompt is an independent roll of the
 * dice: the model has no idea what was wrong last time. Handing back
 * the verifier's problems turns three attempts into three corrections.
 */
function withPreviousProblems(message: string, problems: string[]): string {
  if (problems.length === 0) return message;
  return `${message}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED BY THE VERIFIER:\n${problems
    .map((p) => `- ${p}`)
    .join(
      "\n"
    )}\n\nWrite a fresh response that fixes every one of these. Do not defend the previous attempt or comment on it, just produce a correct one.`;
}

/**
 * Generate one verified question with the regenerate-then-flag policy:
 * up to 1 initial + 2 retries (3 attempts), then flag for admin.
 */
export async function generateVerifiedQuestion(params: {
  examPart: string;
  sectionTitle: string;
  format: QuestionFormat;
  difficulty: number;
  passages: RetrievedChunk[];
  examples: StyleExample[];
  /**
   * Optional topic guide (e.g. the TOG CPD questions for an issue):
   * shows the model WHICH knowledge points are high-yield. Never a
   * source of facts — facts and citations come from passages only.
   */
  highYieldGuide?: string;
  /**
   * Stems already in the bank for this section or document. The new
   * question must test a DIFFERENT point — not merely be reworded.
   */
  alreadyAsked?: string[];
  /** Wall-clock time after which no further attempt is started. */
  deadline?: number;
  /** Wall-clock time by which the request itself must have answered. */
  hardDeadline?: number;
}): Promise<GenerationOutcome> {
  const client = claudeClient();
  const model = claudeModel();

  const system =
    PROMPT_G +
    "\n\n" +
    PROMPT_Q.replace("{{format}}", params.format.toUpperCase())
      .replace("{{exam_part}}", params.examPart)
      .replace("{{section_title}}", params.sectionTitle)
      .replace("{{difficulty}}", String(params.difficulty));

  const highYieldBlock = params.highYieldGuide
    ? `\n\nHIGH-YIELD TOPIC GUIDE (TOG CPD questions for this material):\n${params.highYieldGuide}\n\nThese CPD questions show which knowledge points the examiners consider high-yield. Prefer targeting the SAME knowledge points (e.g. if a CPD question asks about the risk of X, write a question testing the risk of X), but write a NEW ${params.format.toUpperCase()} question in the exam style with a different scenario and different options. Do NOT copy their wording, and do NOT treat them as a source of facts, every fact and citation must come from SOURCE PASSAGES. If the passages do not cover a guide topic, fall back to what the passages do support.`
    : "";

  // These are coverage notes — one line each on what a question tests —
  // so a whole section's history fits where thirty vignettes did not. A
  // stem is several hundred characters of which most is the woman
  // rather than the knowledge; at the tier-1 target of 30 questions a
  // section costs a few hundred tokens here. The cap is therefore set
  // well past anything a section will reach, rather than at what a
  // prompt could afford.
  const ALREADY_ASKED_LIMIT = 200;
  const NOTE_PREVIEW = 220;
  const asked = (params.alreadyAsked ?? []).slice(-ALREADY_ASKED_LIMIT);
  const alreadyAskedBlock = asked.length
    ? `\n\nALREADY ASKED: the knowledge points that existing questions on this material already test:\n${asked
        .map(
          (note, i) =>
            `${i + 1}. ${note.slice(0, NOTE_PREVIEW)}${note.length > NOTE_PREVIEW ? "…" : ""}`
        )
        .join(
          "\n"
        )}\n\nYour question must test a DIFFERENT knowledge point from every one of these. Rewording an existing question, changing its numbers, or asking the same fact from another angle all count as duplicates. Reusing a clinical situation is fine, asking the same fact about it is not. If the source passages only support points that have already been asked, respond with {"error": "insufficient_source_material"} rather than producing a near-duplicate.`
    : "";

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(
    params.passages
  )}\n\nSTYLE EXAMPLES:\n${
    params.examples.length ? formatStyleExamples(params.examples) : "(none provided)"
  }${highYieldBlock}${alreadyAskedBlock}`;

  const retrievedIds = new Set(params.passages.map((p) => p.chunk_id));

  let lastRaw = "";
  let lastProblems: string[] = [];
  /** How long the previous attempt took, to judge whether one more fits. */
  let lastAttemptMs = 0;
  let attemptStartedAt = 0;
  let attemptsRun = 0;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Three attempts can outlast the time the host allows the request,
    // and being killed mid-retry loses the whole run rather than one
    // question: the caller never gets a reply, so nothing is recorded
    // and the page sees a 504. Stop while there is still time to
    // answer, and report what went wrong so far.
    //
    // Asking whether the deadline has passed is not enough, because an
    // attempt that starts just inside it still runs to completion: with
    // four seconds left and an EMQ attempt costing sixteen, the request
    // overruns by twelve and is killed anyway. So the question is
    // whether there is room for ANOTHER attempt, measured by how long
    // the last one actually took.
    if (attempt > 1) lastAttemptMs = Date.now() - attemptStartedAt;
    if (
      params.deadline &&
      attempt > 1 &&
      Date.now() + lastAttemptMs >= params.deadline
    ) {
      break;
    }
    // Counted after the check, not before it: an attempt that is
    // declined for lack of time was never run, and reporting it as run
    // is how "2 attempts" came to describe one.
    attemptsRun = attempt;
    attemptStartedAt = Date.now();
    let raw = "";
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: cacheableSystem(system, model),
        messages: [
          {
            role: "user",
            content: withPreviousProblems(userMessage, lastProblems),
          },
        ],
      }, callOptions(params.hardDeadline, GROUNDING_RESERVE_MS));
      const text = response.content.find((b) => b.type === "text");
      raw = text && text.type === "text" ? text.text : "";
    } catch (error) {
      lastRaw = error instanceof Error ? error.message : String(error);
      lastProblems = ["api error"];
      // API errors (e.g. no credit) won't fix on retry — flag immediately.
      return { status: "flagged", reason: `API error: ${lastRaw}`, raw: lastRaw };
    }

    lastRaw = raw;
    const parsed = parseQuestion(raw);
    if ("insufficient" in parsed) return { status: "insufficient" };
    if ("parseError" in parsed) {
      lastProblems = [`parse error: ${parsed.parseError}`];
      continue;
    }

    const problems = [
      ...verifyQuestion(parsed.question, retrievedIds),
      ...tableProblems(parsed.question.explanation_table, params.passages),
      ...appliedBandProblems(parsed.question.stem, parsed.question.explanation_table),
      ...citedFigureProblems(
        [
          { text: parsed.question.explanation, citation_chunk_ids: [] },
          ...parsed.question.explanations,
        ],
        parsed.question.citation_chunk_ids,
        params.passages,
        [parsed.question.stem, ...parsed.question.options.map((o) => o.text)]
      ),
    ];
    if (problems.length === 0) {
      // Structurally sound — now prove the answer is actually in the
      // sources before it can reach the review queue.
      const grounding = await checkGrounding(
        parsed.question,
        params.passages,
        client,
        model,
        params.hardDeadline
      );
      if (grounding.ok) {
        // Only now randomise: the grounding check must see the same
        // letters the model reasoned about.
        return {
          status: "ok",
          question: orderQuestionOptions(parsed.question),
          attempts: attempt,
        };
      }
      lastProblems = [grounding.reason];
      continue;
    }
    lastProblems = problems;
  }

  return {
    status: "flagged",
    reason: `verification failed after ${attemptsRun} attempt${attemptsRun === 1 ? "" : "s"}${attemptsRun < MAX_ATTEMPTS ? " (out of time for another)" : ""}: ${lastProblems.join("; ")}`,
    raw: lastRaw,
  };
}

/**
 * Generate one verified EMQ SET (shared option list + lead-in +
 * several scenarios), with the same regenerate-then-flag policy and
 * per-scenario grounding as SBAs.
 */
export async function generateVerifiedEmqSet(params: {
  examPart: string;
  sectionTitle: string;
  difficulty: number;
  optionCount: number;
  scenarioCount: number;
  passages: RetrievedChunk[];
  exampleSets: StyleEmqSet[];
  highYieldGuide?: string;
  alreadyAsked?: string[];
  /** Wall-clock time after which no further attempt is started. */
  deadline?: number;
  /** Wall-clock time by which the request itself must have answered. */
  hardDeadline?: number;
}): Promise<EmqOutcome> {
  const client = claudeClient();
  const model = claudeModel();

  const system =
    PROMPT_G +
    "\n\n" +
    PROMPT_Q_EMQ.replace("{{exam_part}}", params.examPart)
      .replace("{{section_title}}", params.sectionTitle)
      .replace("{{difficulty}}", String(params.difficulty))
      .replace(/\{\{option_count\}\}/g, String(params.optionCount))
      .replace(/\{\{scenario_count\}\}/g, String(params.scenarioCount));

  const highYieldBlock = params.highYieldGuide
    ? `\n\nHIGH-YIELD TOPIC GUIDE (TOG CPD questions for this material):\n${params.highYieldGuide}\n\nThese show which knowledge points are high-yield. Target the SAME points with new scenarios and different options. Never copy their wording, and never treat them as a source of facts.`
    : "";

  const asked = (params.alreadyAsked ?? []).slice(-30);
  const alreadyAskedBlock = asked.length
    ? `\n\nALREADY ASKED: scenarios that already exist for this material:\n${asked
        .map((stem, i) => `${i + 1}. ${stem.slice(0, 220)}${stem.length > 220 ? "…" : ""}`)
        .join("\n")}\n\nEvery scenario you write must test a DIFFERENT knowledge point from all of these. If the passages only support points already asked, respond with {"error": "insufficient_source_material"}.`
    : "";

  const userMessage = `SOURCE PASSAGES:\n${formatPassages(
    params.passages
  )}\n\nSTYLE EXAMPLES: copy this SHAPE. Note that ONE option list serves EVERY scenario in a set; the scenarios do not each carry their own options:\n${
    params.exampleSets.length
      ? formatEmqStyleSets(params.exampleSets)
      : "(none provided)"
  }${highYieldBlock}${alreadyAskedBlock}`;

  const retrievedIds = new Set(params.passages.map((p) => p.chunk_id));

  let lastRaw = "";
  let lastProblems: string[] = [];
  /** How long the previous attempt took, to judge whether one more fits. */
  let lastAttemptMs = 0;
  let attemptStartedAt = 0;
  let attemptsRun = 0;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Three attempts can outlast the time the host allows the request,
    // and being killed mid-retry loses the whole run rather than one
    // question: the caller never gets a reply, so nothing is recorded
    // and the page sees a 504. Stop while there is still time to
    // answer, and report what went wrong so far.
    //
    // Asking whether the deadline has passed is not enough, because an
    // attempt that starts just inside it still runs to completion: with
    // four seconds left and an EMQ attempt costing sixteen, the request
    // overruns by twelve and is killed anyway. So the question is
    // whether there is room for ANOTHER attempt, measured by how long
    // the last one actually took.
    if (attempt > 1) lastAttemptMs = Date.now() - attemptStartedAt;
    if (
      params.deadline &&
      attempt > 1 &&
      Date.now() + lastAttemptMs >= params.deadline
    ) {
      break;
    }
    // Counted after the check, not before it: an attempt that is
    // declined for lack of time was never run, and reporting it as run
    // is how "2 attempts" came to describe one.
    attemptsRun = attempt;
    attemptStartedAt = Date.now();
    let raw = "";
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 8192,
        system: cacheableSystem(system, model),
        messages: [
          {
            role: "user",
            content: withPreviousProblems(userMessage, lastProblems),
          },
        ],
      }, callOptions(params.hardDeadline, GROUNDING_RESERVE_MS));
      const text = response.content.find((b) => b.type === "text");
      raw = text && text.type === "text" ? text.text : "";
    } catch (error) {
      lastRaw = error instanceof Error ? error.message : String(error);
      return { status: "flagged", reason: `API error: ${lastRaw}`, raw: lastRaw };
    }

    lastRaw = raw;
    const parsed = parseEmqSet(raw);
    if ("insufficient" in parsed) return { status: "insufficient" };
    if ("parseError" in parsed) {
      lastProblems = [`parse error: ${parsed.parseError}`];
      continue;
    }

    const problems = [
      ...verifyEmqSet(parsed.set, retrievedIds),
      ...parsed.set.scenarios.flatMap((s, i) =>
        citedFigureProblems(s.explanations, s.citation_chunk_ids, params.passages, [
          s.stem,
          parsed.set.lead_in,
          ...parsed.set.options.map((o) => o.text),
        ]).map((p) => `scenario ${i + 1}: ${p}`)
      ),
    ];
    if (problems.length > 0) {
      lastProblems = problems;
      continue;
    }

    // Every scenario's answer must be provable from the passages. The
    // checks are independent, so run them together — sequentially this
    // is the slowest part of generating a set.
    const groundingResults = await Promise.all(
      parsed.set.scenarios.map((scenario) =>
        checkGrounding(
          {
            stem: scenario.stem,
            options: parsed.set.options,
            correct_key: scenario.correct_key,
            // checkGrounding only reads the stem, options and citations;
            // an EMQ scenario has no combined paragraph to give it.
            explanation: "",
            explanations: scenario.explanations,
            difficulty: parsed.set.difficulty,
            citation_chunk_ids: scenario.citation_chunk_ids,
            coverage_note: parsed.set.coverage_note,
            // The grounding check reads none of this; a set's table, if
            // it has one, is checked against the passages separately.
            explanation_table: null,
          },
          params.passages,
          client,
          model,
          params.hardDeadline
        )
      )
    );
    const groundingProblems = groundingResults.flatMap((g, i) =>
      g.ok ? [] : [`scenario ${i + 1}: ${g.reason}`]
    );
    if (groundingProblems.length > 0) {
      // One scenario reaching past the passages should not cost the
      // whole set. Retry while attempts remain — a full set is better —
      // but on the last one, keep the scenarios that did ground if
      // enough are left to still be an EMQ. An unused option is normal:
      // the lead-in already says options may be used once, more than
      // once or not at all.
      const grounded = parsed.set.scenarios.filter(
        (_, i) => groundingResults[i].ok
      );
      // Running out of attempts and running out of time are the same
      // situation from the set's point of view: there will be no
      // further try, so keep what grounded rather than discarding it.
      // Salvaging only on the last attempt meant that once the clock
      // could end a run — which on a 60-second host it usually does —
      // three good scenarios were routinely thrown away because a
      // fourth was not.
      const noTimeForAnother =
        !!params.deadline &&
        Date.now() + (Date.now() - attemptStartedAt) >= params.deadline;
      if (
        (attempt === MAX_ATTEMPTS || noTimeForAnother) &&
        grounded.length >= EMQ_MIN_SCENARIOS
      ) {
        return {
          status: "ok",
          set: orderEmqOptions({ ...parsed.set, scenarios: grounded }),
          attempts: attempt,
        };
      }
      lastProblems = groundingProblems;
      continue;
    }

    return {
      status: "ok",
      set: orderEmqOptions(parsed.set),
      attempts: attempt,
    };
  }

  return {
    status: "flagged",
    reason: `EMQ verification failed after ${attemptsRun} attempt${attemptsRun === 1 ? "" : "s"}${attemptsRun < MAX_ATTEMPTS ? " (out of time for another)" : ""}: ${lastProblems.join("; ")}`,
    raw: lastRaw,
  };
}
