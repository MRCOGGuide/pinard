"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Bank size per sub-topic, by tier. Defaults the form starts from. */
export const DEFAULT_TARGETS: Record<SectionPriority, number> = {
  1: 30,
  2: 15,
  3: 6,
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
  format: QuestionFormat;
  targets: Record<SectionPriority, number>;
}): Promise<EnqueueResult> {
  await requireAdmin();

  const clamp = (n: number) => Math.min(Math.max(Math.round(n) || 0, 0), 200);
  const targets: Record<SectionPriority, number> = {
    1: clamp(input.targets?.[1] ?? DEFAULT_TARGETS[1]),
    2: clamp(input.targets?.[2] ?? DEFAULT_TARGETS[2]),
    3: clamp(input.targets?.[3] ?? DEFAULT_TARGETS[3]),
  };
  const format: QuestionFormat = input.format === "emq" ? "emq" : "sba";
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

  const have = new Map<number, number>();
  for (const q of (questionRows ?? []) as {
    section_id: number;
    format: QuestionFormat;
  }[]) {
    if (q.format !== format) continue;
    have.set(q.section_id, (have.get(q.section_id) ?? 0) + 1);
  }

  const alreadyQueued = new Set(
    (jobRows ?? [])
      .filter((j) => j.format === format)
      .map((j) => j.section_id as number)
  );

  const jobs: {
    section_id: number;
    format: QuestionFormat;
    target: number;
  }[] = [];
  let skipped = 0;

  for (const section of candidates) {
    if (alreadyQueued.has(section.id)) {
      skipped++;
      continue;
    }
    const priority = (section.priority ?? 2) as SectionPriority;
    const shortfall = targets[priority] - (have.get(section.id) ?? 0);
    if (shortfall <= 0) {
      skipped++;
      continue;
    }
    byPriority[priority]++;
    jobs.push({ section_id: section.id, format, target: shortfall });
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
