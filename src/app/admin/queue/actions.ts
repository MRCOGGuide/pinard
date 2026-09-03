"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ExamPart, QuestionFormat, Section } from "@/lib/types";

export type EnqueueResult = {
  error?: string;
  queued?: number;
  questions?: number;
  /** Already at target, or already queued. */
  skipped?: number;
};

/**
 * Fill the gaps: one job per sub-topic that holds fewer than `target`
 * questions, for however many it is short.
 *
 * Sub-topics only. Study plans and sessions serve questions from
 * sub-topics, so anything queued against a parent would generate
 * questions no candidate is ever shown.
 */
export async function enqueueCoverageJobs(input: {
  exam: ExamPart;
  format: QuestionFormat;
  target: number;
}): Promise<EnqueueResult> {
  await requireAdmin();

  const target = Math.min(Math.max(Math.round(input.target) || 0, 1), 200);
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

  // `is_active` is the only switch: a section candidates are examined on
  // is active, a shelf you file documents on is not. The plan, sessions,
  // progress and the diagnostic all read sections the same way, so
  // turning one off removes it from every one of them at once — and a
  // second rule living in here could only ever disagree with them.
  const candidates = inExam;

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
    const shortfall = target - (have.get(section.id) ?? 0);
    if (shortfall <= 0) {
      skipped++;
      continue;
    }
    jobs.push({ section_id: section.id, format, target: shortfall });
  }

  if (jobs.length === 0) {
    return { queued: 0, questions: 0, skipped };
  }

  const { error } = await supabase.from("generation_jobs").insert(jobs);
  if (error) return { error: error.message };

  revalidatePath("/admin/queue");
  return {
    queued: jobs.length,
    questions: jobs.reduce((sum, j) => sum + j.target, 0),
    skipped,
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
