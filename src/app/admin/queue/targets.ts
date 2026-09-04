import type { SectionPriority } from "@/lib/types";

/**
 * Bank size per sub-topic, by tier. The defaults the queue form starts
 * from, and the fallback when a target is left blank.
 *
 * A file of its own because both sides need it: the server action that
 * queues the jobs, and the form the owner adjusts before queueing. It
 * cannot live beside the action — a "use server" module may export
 * async functions and nothing else, so an exported object there is a
 * build error rather than a lint.
 *
 * The proportions are the plan's. A core clinical topic earns a bank a
 * candidate cannot exhaust; background material earns enough to be met
 * occasionally, which is how often the plan serves it.
 */
export const DEFAULT_TARGETS: Record<SectionPriority, number> = {
  1: 30,
  2: 15,
  3: 6,
};
