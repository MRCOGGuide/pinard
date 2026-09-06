import type { SectionPriority } from "@/lib/types";

/**
 * Bank size per sub-topic, by tier — the total across both formats.
 *
 * The ceiling is what the study plan demands. Run planDemandBySection
 * for a worst-case candidate — weak in every section, 120 days out —
 * and it asks 64 questions of a core sub-topic, 48 of a supporting one
 * and 40 of background, over a cycle in which no question repeats.
 *
 * These are the staging point on the way there: enough that a typical
 * candidate, weak in some sections rather than all, finishes a cycle
 * without meeting the same question twice.
 *
 * A file of its own because both sides need it: the server action that
 * queues the jobs, and the form the owner adjusts before queueing. It
 * cannot sit beside the action — a "use server" module may export async
 * functions and nothing else.
 */
export const DEFAULT_TARGETS: Record<SectionPriority, number> = {
  1: 30,
  2: 24,
  3: 16,
};

/**
 * How a section's target divides between the two formats.
 *
 * Half each, because that is the paper: each of the two Part 2 papers
 * is 50 SBAs and 50 EMQs. It also lands the practice emphasis where
 * the marks are without having to weight the count — the RCOG allows
 * 110 minutes for the EMQs against 70 for the SBAs, so an even split by
 * count is a 61/39 split by time, against an EMQ mark weighting of 60%.
 */
export const SBA_SHARE = 0.5;

/** A section's target, split into the two formats it is generated in. */
export function splitTarget(total: number): { sba: number; emq: number } {
  const sba = Math.round(total * SBA_SHARE);
  return { sba, emq: Math.max(0, total - sba) };
}

/**
 * Questions a section's passages can carry, per chunk.
 *
 * A target is what the study plan would like; this is what the sources
 * can actually answer. Asking past it does not produce worse questions,
 * because the grounding check refuses them — it produces no questions,
 * three runs in a row, and then a failed job. On a plan billed per
 * model call that is the most expensive way to learn a section is
 * finished.
 *
 * Set from the bank's own history. Complications of Fertility
 * Treatments ran dry at 0.44 questions per chunk and failed; the
 * sections still producing sit at 0.13 to 0.23. Sections above it —
 * Clinical Skills at 1.46, Antenatal Screening at 0.76, Consent
 * Advices at 0.74 — are already past what their passages hold, and
 * capping simply stops asking them for more.
 */
export const QUESTIONS_PER_CHUNK = 0.4;

/**
 * Chunks an EMQ set is built from, matching EMQ_PASSAGE_COUNT in
 * generate-batch: a set takes a contiguous window from ONE document,
 * because scenarios assembled from unrelated chunks come back as
 * insufficient_source_material.
 */
const CHUNKS_PER_EMQ_SET = 14;

/** Scenarios a set yields, at the sizes the generator asks for. */
const SCENARIOS_PER_SET = 3;

/** What the passages can support, in questions. */
export function sectionCapacity(chunks: number): number {
  return Math.floor(chunks * QUESTIONS_PER_CHUNK);
}

/**
 * What the passages can support as EMQs specifically.
 *
 * Stricter than the section total, and separately so: an EMQ needs a
 * single document long enough to give a whole set a shared topic. A
 * section of nine short guidance statements has material for SBAs and
 * none for a set, however many chunks it adds up to.
 */
export function emqCapacity(documentChunkCounts: number[]): number {
  const sets = documentChunkCounts.reduce(
    (total, chunks) => total + Math.floor(chunks / CHUNKS_PER_EMQ_SET),
    0
  );
  return sets * SCENARIOS_PER_SET;
}

/**
 * A section's target, capped by what its passages hold and split by
 * format — with the EMQ shortfall handed to SBA rather than dropped.
 *
 * That last part is the point. A section whose documents are too short
 * for a set would otherwise be examined at half depth, and the half it
 * lost is not a format a candidate can choose to skip: it is the
 * material itself. Turning it into SBAs keeps every passage examinable
 * and costs a candidate only the shape of the question.
 */
export function capacityAwareSplit(input: {
  target: number;
  chunks: number;
  documentChunkCounts: number[];
}): { sba: number; emq: number; total: number; cappedByMaterial: boolean } {
  const capacity = sectionCapacity(input.chunks);
  const total = Math.min(input.target, capacity);
  const even = splitTarget(total);
  const emq = Math.min(even.emq, emqCapacity(input.documentChunkCounts));
  return {
    sba: total - emq,
    emq,
    total,
    cappedByMaterial: capacity < input.target,
  };
}
