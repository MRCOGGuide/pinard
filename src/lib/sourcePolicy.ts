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

/**
 * Sections a bulk generation run leaves alone.
 *
 * Not the Similar Values rule: that one asks which sources may supply a
 * figure and admits only three Governance sub-sections. Generation is
 * broader — Consent Advice, clinical and surgical skills are all
 * examined — so only material that is not a clinical topic at all is
 * excluded here: patient-facing leaflets, and the process paperwork a
 * candidate is never asked about.
 *
 * The owner's call, and deliberately a short explicit list rather than
 * a guess: add or remove a title and bulk runs follow.
 */
const NOT_A_SYLLABUS_TOPIC = [
  "patient information leaflets",
  "clinical governance",
  "learning reports",
  "maternity safety",
  "patient safety alerts",
  "teaching and research",
];

/** Anything filed as patient-facing, whatever the section is called. */
const PATIENT_FACING = /patient information|leaflet/i;

/**
 * Is this section one a candidate is examined on? Used when queueing
 * generation across a whole exam, so a bulk run spends its budget on
 * the syllabus rather than on leaflets and committee paperwork.
 *
 * Deliberately a section rule, not a document rule: document tiers are
 * guessed from the title at upload, and an RCOG leaflet titled "Your
 * baby's movements in pregnancy" reads as core guidance to that guess.
 * The section it was filed under does not.
 */
export function isExaminableSection(source: {
  sectionTitle: string | null;
  parentTitle: string | null;
}): boolean {
  const own = source.sectionTitle?.trim().toLowerCase() ?? "";
  const parent = source.parentTitle?.trim().toLowerCase() ?? "";

  if (PATIENT_FACING.test(own) || PATIENT_FACING.test(parent)) return false;
  if (NOT_A_SYLLABUS_TOPIC.includes(own)) return false;
  if (own === GOVERNANCE_SECTION.toLowerCase()) return false;

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
