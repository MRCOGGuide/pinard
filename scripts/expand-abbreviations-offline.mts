/**
 * Write out a subspecialty abbreviation on its first use.
 *
 * The house rule is that anything outside the everyday set appears in
 * full the first time, with the short form in brackets after it, and
 * the short form alone thereafter. Questions written before the lint
 * could be enforced do not keep it.
 *
 * The expansion is taken from the document the question was written
 * from, not from the model and not from me: a paper that uses a term
 * almost always introduces it, and quoting its own words is the only
 * expansion that can be checked. Anything the source never spells out
 * is reported rather than guessed — "offline" in the name because this
 * runs without the API, which is the point.
 *
 *   npx tsx scripts/expand-abbreviations-offline.mts --dry
 *   npx tsx scripts/expand-abbreviations-offline.mts --dry 1208
 *   npx tsx scripts/expand-abbreviations-offline.mts
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
const { unexpandedAbbreviations } = await import("../src/lib/abbreviations");
const { verifyQuestion } = await import("../src/lib/generation");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
/** Print every expansion the sources give and change nothing. */
const LIST = args.includes("--list");
const ONLY = args.filter((a) => /^\d+$/.test(a)).map(Number);

const db = createAdminClient();

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);

/** Text of a document, cached — several questions share one paper. */
const docCache = new Map<number, string>();
async function documentText(id: number): Promise<string> {
  const cached = docCache.get(id);
  if (cached !== undefined) return cached;
  const chunks = await fetchAll<{ text: string }>((from, to) =>
    db
      .from("content_chunks")
      .select("text")
      .eq("document_id", id)
      .order("chunk_index")
      .range(from, to)
  );
  const text = chunks.map((c) => c.text).join("\n");
  docCache.set(id, text);
  return text;
}

/**
 * Expansions the sources never spell out, supplied by hand and checked
 * by the owner before any of them was written into a question.
 *
 * Two were confirmed against the source rather than assumed, because
 * both looked wrong. "tenofovir DX" reads like an OCR slip for DF, and
 * is not: the BHIVA guideline writes "Tenofovir disoproxil (DX)". TCS
 * sat in a sentence about tacrolimus, and belongs to a different one —
 * the lichen sclerosus review introduces "topical corticosteroid (TCS)".
 */
const DICTIONARY: Record<string, string> = {
  aOR: "adjusted odds ratio",
  NNH: "number needed to harm",
  SMD: "standardised mean difference",
  PFS: "progression-free survival",
  EE: "ethinylestradiol",
  HFI: "hormone-free interval",
  sHRT: "sequential HRT",
  PCOM: "polycystic ovarian morphology",
  TPOAb: "thyroid peroxidase antibody",
  CEA: "carcinoembryonic antigen",
  FDG: "fluorodeoxyglucose",
  POLE: "DNA polymerase epsilon",
  PARPi: "PARP inhibitor",
  HIPEC: "hyperthermic intraperitoneal chemotherapy",
  GAC: "gastric-type adenocarcinoma",
  HNF: "hepatocyte nuclear factor",
  rASRM: "revised American Society for Reproductive Medicine",
  RVVC: "recurrent vulvovaginal candidiasis",
  SLL: "second-look laparoscopy",
  OPH: "outpatient hysteroscopy",
  RAL: "robotic-assisted laparoscopy",
  SDD: "same-day discharge",
  QF: "quantitative fluorescence",
  NIPD: "non-invasive prenatal diagnosis",
  NIHF: "non-immune hydrops fetalis",
  TAPS: "twin anaemia-polycythaemia sequence",
  AREDV: "absent or reversed end-diastolic velocity",
  iAREDV: "intermittent absent or reversed end-diastolic velocity",
  NMDAR: "N-methyl-D-aspartate receptor",
  PPGL: "phaeochromocytoma and paraganglioma",
  NOA: "non-obstructive azoospermia",
  PESA: "percutaneous epididymal sperm aspiration",
  MII: "metaphase II",
  AZFa: "azoospermia factor a",
  AZFb: "azoospermia factor b",
  AZFc: "azoospermia factor c",
  PNP: "postnatal prophylaxis",
  PNMH: "perinatal mental health",
  POCTs: "point-of-care tests",
  LLMICs: "low- and lower-middle-income countries",
  NTN: "national training number",
  PAs: "programmed activities",
  ARNIs: "angiotensin receptor/neprilysin inhibitors",
  DX: "disoproxil",
  TCS: "topical corticosteroid",
};

/** Words an acronym skips over. */
const SKIPPED = new Set([
  "of", "and", "the", "a", "an", "in", "for", "to", "with", "or", "on",
]);

/**
 * Trim a candidate phrase to the expansion itself.
 *
 * Taking the words before the bracket grabs whatever the sentence was
 * doing beforehand: the source offers "In particular, those with absent
 * or reversed end-diastolic velocities (AREDV)" and "z Non-invasive
 * prenatal diagnostic (NIPD)". The expansion is the shortest tail of
 * that phrase whose initials spell the abbreviation, skipping the small
 * words an acronym always skips — which is how "haemolytic disease of
 * the fetus and newborn" is recovered from a sentence that ran into it.
 */
function trimToInitials(phrase: string, abbrev: string): string | null {
  const letters = abbrev.replace(/[^A-Za-z]/g, "").toLowerCase().split("");
  const words = phrase.split(/\s+/).filter(Boolean);

  for (let start = 0; start < words.length; start++) {
    const tail = words.slice(start);
    const significant = tail.filter(
      (w) => !SKIPPED.has(w.replace(/[^A-Za-z]/g, "").toLowerCase())
    );
    if (significant.length !== letters.length) continue;
    const initials = significant.map((w) =>
      (w.replace(/[^A-Za-z]/g, "")[0] ?? "").toLowerCase()
    );
    if (initials.join("") === letters.join("")) {
      // The skipped words were never counted, so any at the front are
      // the sentence running in rather than part of the name: "of
      // caesarean scar ectopic pregnancy", "with mechanical heart
      // valves". Drop them.
      let words2 = tail;
      while (
        words2.length > 0 &&
        SKIPPED.has(words2[0].replace(/[^A-Za-z]/g, "").toLowerCase())
      ) {
        words2 = words2.slice(1);
      }
      // Verbs the sentence used to reach the name — "is in vitro
      // maturation", "known as impacted fetal head".
      while (
        words2.length > 1 &&
        /^(?:is|are|was|were|known|called|termed|named|as)$/i.test(
          words2[0].replace(/[^A-Za-z]/g, "")
        )
      ) {
        words2 = words2.slice(1);
      }
      let phrase = words2.join(" ").replace(/^[^A-Za-z]+/, "");
      // A name keeps its capitals; a description does not start with
      // one mid-sentence. Title case in the rest of the phrase is what
      // separates "British Sign Language" from "Female genital
      // cosmetic surgery".
      const words3 = phrase.split(/\s+/);
      const capitalised = words3.filter((w) => /^[A-Z]/.test(w)).length;
      if (capitalised <= 1 && /^[A-Z][a-z]/.test(phrase)) {
        phrase = phrase[0].toLowerCase() + phrase.slice(1);
      }
      return phrase
        // House style, applied to what the source happened to write.
        .replace(/\bfoetus\b/gi, "fetus")
        .replace(/\bfoetal\b/gi, "fetal")
        .replace(/\bnorepinephrine\b/gi, "noradrenaline")
        .replace(/\bestrogen\b/gi, "oestrogen");
    }
  }
  return null;
}

/**
 * What the source calls it. Looks for the paper's own introduction —
 * "hepatorenal syndrome (HRS)" — then trims to the expansion proper.
 * Anything whose initials cannot be matched is left for a human, since
 * a plausible-looking wrong expansion is worse than none.
 */
function expansionFrom(corpus: string, abbrev: string): string | null {
  const bare = /[A-Za-z]s$/.test(abbrev) ? abbrev.slice(0, -1) : abbrev;
  const pattern = new RegExp(
    "([A-Za-z][A-Za-z0-9 ,'\\u2019/-]{4,90}?)\\s*\\(\\s*" +
      escape(bare) +
      "s?\\s*\\)",
    "g"
  );
  const supplied = DICTIONARY[abbrev] ?? DICTIONARY[bare];
  for (const found of corpus.matchAll(pattern)) {
    // PDF extraction breaks words across lines: "new- born",
    // "progression- free". Rejoin before matching initials.
    const phrase = found[1].replace(/(\w)-\s+(\w)/g, "$1$2").trim();
    const trimmed = trimToInitials(phrase, bare);
    if (trimmed && trimmed.length >= 5) return trimmed;
  }
  return supplied ?? null;
}

type Row = {
  id: number;
  status: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: { key: string; text: string }[];
  citation_chunk_ids: number[] | null;
  source_document_ids: number[] | null;
};

let rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("*")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);
if (ONLY.length > 0) rows = rows.filter((r) => ONLY.includes(r.id));

let fixed = 0;
let partial = 0;
const unresolved = new Map<string, number>();
const listed = new Map<string, string>();

for (const q of rows) {
  const explanation = q.explanations?.find((e) => e.key === q.correct_key);
  const candidateText = [
    q.stem,
    ...(q.options ?? []).map((o) => o.text),
    explanation?.text ?? "",
  ].join("\n");
  const wanted = unexpandedAbbreviations(candidateText);
  if (wanted.length === 0) continue;

  let corpus = "";
  for (const id of q.source_document_ids ?? []) corpus += await documentText(id);

  let stem = q.stem;
  const options = (q.options ?? []).map((o) => ({ ...o }));
  const explanations = (q.explanations ?? []).map((e) => ({ ...e }));
  const done: string[] = [];
  const left: string[] = [];

  for (const abbrev of wanted) {
    const phrase = expansionFrom(corpus, abbrev);
    if (!phrase) {
      left.push(abbrev);
      unresolved.set(abbrev, (unresolved.get(abbrev) ?? 0) + 1);
      continue;
    }
    if (LIST) {
      if (!listed.has(abbrev)) {
        listed.set(abbrev, phrase);
        console.log(`  ${abbrev.padEnd(9)} ${phrase}`);
      }
      continue;
    }
    // First use, in the order a candidate reads: stem, then options,
    // then the explanation. Only the first is expanded; the rule wants
    // the short form alone after that.
    const bare = /[A-Za-z]s$/.test(abbrev) ? abbrev.slice(0, -1) : abbrev;
    const first = new RegExp("\\b" + escape(abbrev) + "\\b");
    const replacement = `${phrase} (${abbrev})`;

    if (first.test(stem)) {
      stem = stem.replace(first, replacement);
    } else {
      const optionIndex = options.findIndex((o) => first.test(o.text));
      if (optionIndex >= 0) {
        options[optionIndex].text = options[optionIndex].text.replace(
          first,
          replacement
        );
      } else {
        const target = explanations.find((e) => e.key === q.correct_key);
        if (!target || !first.test(target.text)) {
          left.push(abbrev);
          continue;
        }
        target.text = target.text.replace(first, replacement);
      }
    }
    done.push(abbrev);
  }

  if (LIST) continue;

  if (done.length === 0) continue;

  const next = { ...q, stem, options, explanations };
  const problems = verifyQuestion(
    next as never,
    new Set(q.citation_chunk_ids ?? [])
  );
  // Verification includes the abbreviation lint, so anything still
  // unexpanded here is one the source never spelled out. That is not a
  // reason to discard the expansions that did work.
  const blocking = problems.filter((p) => !/is never written out/.test(p));
  if (blocking.length > 0) {
    console.log(`#${q.id}: BLOCKED — ${blocking[0].slice(0, 90)}`);
    continue;
  }

  console.log(
    `#${q.id} (${q.status}): expanded ${done.join(", ")}${
      left.length ? ` | left: ${left.join(", ")}` : ""
    }`
  );
  if (left.length > 0) partial++;
  else fixed++;

  if (DRY) continue;
  const { error } = await db
    .from("generated_questions")
    .update({ stem, options, explanations })
    .eq("id", q.id);
  if (error) console.log(`   FAILED — ${error.message}`);
}

console.log(
  `\n${DRY ? "would fix" : "fixed"} ${fixed} fully, ${partial} partly`
);
if (unresolved.size > 0) {
  console.log(`\nnot spelled out in their own source (${unresolved.size}):`);
  console.log(
    "   " +
      [...unresolved.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([a, n]) => `${a}(${n})`)
        .join("  ")
  );
}
