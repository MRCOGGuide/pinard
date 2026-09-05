"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TARGETS, splitTarget } from "./targets";
import type {
  ExamPart,
  QuestionFormat,
  Section,
  SectionPriority,
} from "@/lib/types";

export type EnqueueResult = {
  error?: string;
  queued?: number;
  questions?: number;
  /** Already at target, or already queued. */
  skipped?: number;
  /** How many sections were queued in each tier. */
  byPriority?: Record<SectionPriority, number>;
};

/**
 * Fill the gaps: one job per sub-topic that holds fewer questions than
 * its tier calls for, for however many it is short.
 *
 * The bank is built in the same proportion the plan revises in. A core
 * clinical topic earns a bank a candidate cannot exhaust; background
 * material earns enough to be met occasionally, which is how often the
 * plan serves it.
 *
 * Sub-topics only. Study plans and sessions serve questions from
 * sub-topics, so anything queued against a parent would generate
 * questions no candidate is ever shown.
 */
export async function enqueueCoverageJobs(input: {
  exam: ExamPart;
  /** Omit, or pass "both", to queue each section in both formats. */
  format?: QuestionFormat | "both";
  targets: Record<SectionPriority, number>;
}): Promise<EnqueueResult> {
  await requireAdmin();

  const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 0, 0), 200);
  const targets: Record<SectionPriority, number> = {
    1: clamp(input.targets?.[1] ?? DEFAULT_TARGETS[1]),
    2: clamp(input.targets?.[2] ?? DEFAULT_TARGETS[2]),
    3: clamp(input.targets?.[3] ?? DEFAULT_TARGETS[3]),
  };
  // A section's target is the total across both formats, and the
  // default queues both: the paper is 50 SBAs and 50 EMQs, so a bank
  // that is not is a bank that practises the wrong thing.
  const formats: QuestionFormat[] =
    input.format === "sba" || input.format === "emq"
      ? [input.format]
      : ["sba", "emq"];
  const supabase = createAdminClient();

  const [{ data: sectionRows }, { data: questionRows }, { data: documentRows }, { data: jobRows }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      // Pending counts as coverage: it is already written and waiting
      // on review, so generating more of it only lengthens the queue.
      supabase
        .from("generated_questions")
        .select("section_id, format")
        .in("status", ["approved", "pending"]),
      supabase
        .from("content_documents")
        .select("section_id")
        .eq("status", "ingested"),
      supabase
        .from("generation_jobs")
        .select("section_id, format, status")
        .in("status", ["queued", "running"]),
    ]);

  const sections = (sectionRows ?? []) as Section[];
  const parents = new Map(
    sections.filter((s) => s.parent_id === null).map((s) => [s.id, s])
  );

  // Only sub-topics of the chosen exam, and only ones with material.
  const withSources = new Set(
    (documentRows ?? []).map((d) => d.section_id as number)
  );
  const inExam = sections.filter(
    (s) =>
      s.parent_id !== null &&
      s.is_active &&
      parents.get(s.parent_id)?.exam === input.exam &&
      withSources.has(s.id)
  );

  // Every section is queued; how deep a bank it gets is its tier's
  // business, and a tier set to 0 is simply never queued.
  const candidates = inExam;
  const byPriority: Record<SectionPriority, number> = { 1: 0, 2: 0, 3: 0 };

  // Held per format: a section can be full of SBAs and short of EMQs.
  const have = new Map<string, number>();
  for (const q of (questionRows ?? []) as {
    section_id: number;
    format: QuestionFormat;
  }[]) {
    const k = `${q.section_id}:${q.format}`;
    have.set(k, (have.get(k) ?? 0) + 1);
  }

  const alreadyQueued = new Set(
    (jobRows ?? []).map((j) => `${j.section_id}:${j.format}`)
  );

  const jobs: {
    section_id: number;
    format: QuestionFormat;
    target: number;
  }[] = [];
  let skipped = 0;

  for (const section of candidates) {
    const priority = (section.priority ?? 2) as SectionPriority;
    const split = splitTarget(targets[priority]);
    // A section counts toward its tier once, however many formats it is
    // short in — the tally is of sub-topics, not of jobs.
    let queuedHere = false;

    for (const format of formats) {
      if (alreadyQueued.has(`${section.id}:${format}`)) {
        skipped++;
        continue;
      }
      const want = format === "sba" ? split.sba : split.emq;
      const shortfall = want - (have.get(`${section.id}:${format}`) ?? 0);
      if (shortfall <= 0) {
        skipped++;
        continue;
      }
      jobs.push({ section_id: section.id, format, target: shortfall });
      queuedHere = true;
    }

    if (queuedHere) byPriority[priority]++;
  }

  if (jobs.length === 0) {
    return { queued: 0, questions: 0, skipped, byPriority };
  }

  const { error } = await supabase.from("generation_jobs").insert(jobs);
  if (error) return { error: error.message };

  revalidatePath("/admin/queue");
  return {
    queued: jobs.length,
    questions: jobs.reduce((sum, j) => sum + j.target, 0),
    skipped,
    byPriority,
  };
}

/** Stop a job. Whatever it already generated stays in the review queue. */
export async function cancelJob(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}

/** Put a failed or cancelled job back in the queue. */
export async function retryJob(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .update({
      status: "queued",
      empty_runs: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}

/** Clear finished jobs out of the list. */
export async function clearFinishedJobs(): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("generation_jobs")
    .delete()
    .in("status", ["done", "failed", "cancelled"]);
  if (error) return { error: error.message };
  revalidatePath("/admin/queue");
  return {};
}
