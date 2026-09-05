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
