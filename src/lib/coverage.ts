import {
  addDays,
  buildStudyPlan,
  toISO,
  type PlanUnit,
} from "@/lib/studyPlan";

/**
 * Question-bank coverage planning: how many approved questions each
 * section needs, and where the gaps are.
 *
 * Two independent demands, and a section needs to satisfy both:
 *
 * 1. DEMAND — a candidate must never be shown the same question twice
 *    over their revision. This is measured, not guessed: we run the
 *    real study-plan algorithm for a worst-case candidate (weak in
 *    every section, so the plan schedules them the most) and total the
 *    questions it asks of each section.
 *
 * 2. COVERAGE — every ingested article should be tested, so no topic
 *    is silently absent. Scaled by document length, since a 200-chunk
 *    guideline holds far more examinable material than a 4-chunk one.
 *
 * Pure functions only — unit-tested, no I/O.
 */

/** Documents shorter than this are editorials/letters: not examinable. */
export const MIN_CHUNKS_FOR_QUESTIONS = 3;
/** Roughly one question per this many chunks of source text. */
const CHUNKS_PER_QUESTION = 10;
const MAX_PER_DOCUMENT = 8;
/** Headroom over bare demand: off-plan practise, diagnostics, retakes. */
export const HEADROOM = 1.3;
/**
 * Ceiling on how many genuinely distinct questions a body of source
 * text can yield. Chunks are 600–800 tokens and overlap by ~15%, so
 * beyond roughly one question per chunk you are re-testing the same
 * facts — which is exactly the repetition we're trying to avoid.
 * When demand exceeds this, the answer is more source material, not
 * more questions.
 */
const QUESTIONS_PER_CHUNK_CEILING = 1;

/** Questions worth writing from a single document, by its length. */
export function documentTarget(chunkCount: number): number {
  if (chunkCount < MIN_CHUNKS_FOR_QUESTIONS) return 0;
  return Math.min(
    MAX_PER_DOCUMENT,
    Math.max(1, Math.round(chunkCount / CHUNKS_PER_QUESTION))
  );
}

/**
 * Questions the study plan will ask of each section over `days`, for a
 * candidate weak in everything (the heaviest realistic schedule).
 */
export function planDemandBySection(
  sectionIds: number[],
  days: number
): Record<number, number> {
  const demand: Record<number, number> = {};
  for (const id of sectionIds) demand[id] = 0;
  if (sectionIds.length === 0 || days <= 0) return demand;

  const today = new Date(Date.UTC(2026, 0, 1));
  const units: PlanUnit[] = sectionIds.map((id) => ({
    section_id: id,
    title: String(id),
    band: "weak",
    accuracy: 0,
  }));

  const plan = buildStudyPlan(
    toISO(today),
    toISO(addDays(today, days)),
    units
  );
  for (const week of plan.weeks) {
    for (const day of week.days) {
      for (const item of day.items) {
        demand[item.section_id] =
          (demand[item.section_id] ?? 0) + item.question_target;
      }
    }
  }
  return demand;
}

export type SectionCoverage = {
  sectionId: number;
  label: string;
  documents: number;
  examinableDocuments: number;
  chunks: number;
  approvedSba: number;
  approvedEmq: number;
  approved: number;
  /** Questions a candidate would be asked here over the period. */
  demand: number;
  /** Sum of per-document targets — enough to test every article. */
  coverageNeed: number;
  /** Most distinct questions this section's sources can support. */
  capacity: number;
  /** What to aim for: demand vs coverage, capped by capacity. */
  target: number;
  /** True when demand outstrips the material — upload more sources. */
  needsMoreSource: boolean;
  /** Still to generate (never negative). */
  gap: number;
  /** Ingested documents with no approved question yet. */
  uncovered: { id: number; title: string; chunks: number }[];
};

export type CoverageInput = {
  sections: { id: number; label: string }[];
  documents: {
    id: number;
    title: string;
    sectionId: number;
    chunks: number;
  }[];
  questions: {
    sectionId: number;
    format: "sba" | "emq";
    sourceDocumentIds: number[];
  }[];
  days: number;
};

export function buildCoverage(input: CoverageInput): SectionCoverage[] {
  const demandBySection = planDemandBySection(
    input.sections.map((s) => s.id),
    input.days
  );

  const documentsWithQuestions = new Set<number>();
  for (const q of input.questions) {
    for (const id of q.sourceDocumentIds) documentsWithQuestions.add(id);
  }

  return input.sections.map((section) => {
    const docs = input.documents.filter((d) => d.sectionId === section.id);
    const examinable = docs.filter(
      (d) => d.chunks >= MIN_CHUNKS_FOR_QUESTIONS
    );
    const questions = input.questions.filter(
      (q) => q.sectionId === section.id
    );

    const approvedSba = questions.filter((q) => q.format === "sba").length;
    const approvedEmq = questions.filter((q) => q.format === "emq").length;
    const approved = approvedSba + approvedEmq;

    const coverageNeed = docs.reduce(
      (sum, d) => sum + documentTarget(d.chunks),
      0
    );
    const demand = demandBySection[section.id] ?? 0;

    // Examinable text sets the ceiling: asking for more questions than
    // the material supports just produces near-duplicates.
    const capacity = Math.floor(
      examinable.reduce((s, d) => s + d.chunks, 0) * QUESTIONS_PER_CHUNK_CEILING
    );
    const desired =
      coverageNeed === 0
        ? 0
        : Math.ceil(Math.max(demand, coverageNeed) * HEADROOM);
    const target = Math.min(desired, capacity);

    return {
      sectionId: section.id,
      label: section.label,
      documents: docs.length,
      examinableDocuments: examinable.length,
      chunks: docs.reduce((s, d) => s + d.chunks, 0),
      approvedSba,
      approvedEmq,
      approved,
      demand,
      coverageNeed,
      capacity,
      target,
      needsMoreSource: desired > capacity,
      gap: Math.max(0, target - approved),
      uncovered: examinable
        .filter((d) => !documentsWithQuestions.has(d.id))
        .map((d) => ({ id: d.id, title: d.title, chunks: d.chunks }))
        .sort((a, b) => b.chunks - a.chunks),
    };
  });
}
