/**
 * Which sources may supply a figure to the Similar Values panel.
 *
 * The panel exists to make a number stick by putting it in company, so
 * every figure in it should be one a candidate could be asked for. That
 * is a property of the source as much as of the sentence: a CPD
 * question, a letter to the editor or a patient leaflet can state a
 * clean percentage that is no use in an exam.
 *
 * The bulk should come from RCOG Green-top Guidelines and NICE, which
 * live in the clinical sections and are admitted by default. The two
 * places that need a rule are TOG and Governance.
 */

/** The top-level section whose sub-topics are mostly not exam content. */
export const GOVERNANCE_SECTION = "Governance";

/**
 * Governance sub-sections that are examined guidance despite sitting
 * under Governance.
 *
 * "Best Practice Papers" and "Good Practice Papers" are both kept: they
 * hold the same kind of document, and the RCOG series is titled Good
 * Practice Paper.
 */
export const GOVERNANCE_ALLOWED = new Set([
  "scientific impact papers",
  "best practice papers",
  "good practice papers",
]);

/**
 * The only TOG content that carries examinable figures. The other
 * categories are CPD questions, letters and replies, and MBRRACE/UKOSS
 * updates.
 */
export const TOG_ALLOWED_CATEGORY = "article";

export type SourceShape = {
  /** null for anything that is not a TOG document. */
  togCategory: string | null;
  /** The section the document sits in, and its parent if it has one. */
  sectionTitle: string | null;
  parentTitle: string | null;
};

/** May a figure from this document appear in Similar Values? */
export function isAllowedSimilarValuesSource(source: SourceShape): boolean {
  const { togCategory, sectionTitle, parentTitle } = source;

  // TOG: articles only.
  if (togCategory) {
    return togCategory.trim().toLowerCase() === TOG_ALLOWED_CATEGORY;
  }

  // Governance: only the papers that carry examined guidance. The
  // section may be the sub-topic ("Scientific Impact Papers", parent
  // "Governance") or, if a document sits directly on it, the top level.
  const parent = parentTitle?.trim().toLowerCase();
  const own = sectionTitle?.trim().toLowerCase();
  const governance = GOVERNANCE_SECTION.toLowerCase();
  if (parent === governance) return GOVERNANCE_ALLOWED.has(own ?? "");
  if (own === governance) return false;

  // Everything else is clinical: Green-top Guidelines, NICE and the
  // rest of the syllabus sections.
  return true;
}

/** Resolve a section id to its own and parent titles. */
export type SectionLookup = Map<
  number,
  { title: string; parentTitle: string | null }
>;

export function buildSectionLookup(
  sections: { id: number; title: string; parent_id: number | null }[]
): SectionLookup {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const lookup: SectionLookup = new Map();
  for (const s of sections) {
    const parent = s.parent_id ? byId.get(s.parent_id) : null;
    lookup.set(s.id, { title: s.title, parentTitle: parent?.title ?? null });
  }
  return lookup;
}

/**
 * Preference order when choosing which companions to show.
 *
 * Filtering alone cannot make the panel mostly Green-top and NICE: the
 * bank holds far more extracted figures from TOG articles and Scientific
 * Impact Papers than from the clinical guidelines. Ranking can — a value
 * usually has more companions than the three slots available, so taking
 * examined guidance first puts GTG and NICE in front of the candidate
 * even while the store stays TOG-heavy.
 *
 * 0 clinical guidance (Green-top, NICE and the rest of the syllabus)
 * 1 Scientific Impact and practice papers
 * 2 TOG articles
 */
export function similarValuesSourceRank(source: SourceShape): number {
  if (source.togCategory) return 2;
  const parent = source.parentTitle?.trim().toLowerCase();
  if (parent === GOVERNANCE_SECTION.toLowerCase()) return 1;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Patient information                                                 */
/* ------------------------------------------------------------------ */

/**
 * The library holds RCOG patient information leaflets on purpose —
 * they are how the model will be taught to counsel in plain language
 * for Part 3. They are not a source for Part 2 questions.
 *
 * Question #1255 is what that costs: grounded, faithfully, in the 2013
 * leaflet "HIV and pregnancy", it marked zidovudine monotherapy as the
 * right regimen. The leaflet does say so. BHIVA has since recommended
 * antiretroviral therapy for everyone, and the leaflet itself calls
 * HAART "the usual treatment", so the marked answer was not even
 * uniquely correct on its own source. Anything a leaflet covers that is
 * examinable is in the guideline it summarises, stated at the strength
 * the guideline chose.
 *
 * Detected from the prose rather than a flag, because nothing in the
 * schema records it and a leaflet ingested tomorrow should be caught
 * without anyone remembering to mark it. Guidance describes a patient;
 * a leaflet addresses one.
 */
const SECOND_PERSON = /\b(you|your|you're|yours|yourself)\b/gi;

/** Second-person words as a share of all words. Leaflets measure 5-8%;
 *  clinical guidance is near zero even when it quotes a conversation. */
export const PATIENT_PROSE_SHARE = 0.012;

/** Too short to judge: a stray "your" in a heading would carry it. */
const ENOUGH_WORDS = 400;

/**
 * Whether a document's prose reads as written for the patient, judged
 * over as much of it as the caller holds.
 */
export function readsAsPatientInformation(texts: string[]): boolean {
  let you = 0;
  let words = 0;
  for (const text of texts) {
    you += (text.match(SECOND_PERSON) ?? []).length;
    words += text.split(/\s+/).length;
  }
  if (words < ENOUGH_WORDS) return false;
  return you / words > PATIENT_PROSE_SHARE;
}
