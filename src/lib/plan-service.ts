import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStudyPlan, type StudyPlan, type PlanUnit } from "@/lib/studyPlan";
import { buildPlanUnits, type PerfRow } from "@/lib/performance";
import { fallbackNarrative, generatePlanNarrative } from "@/lib/narrative";
import { EXAM_LABELS, type ExamPart, type Section } from "@/lib/types";

/**
 * Loads the user's study plan, regenerating it only when the inputs shift
 * materially (performance band change or exam-date change) — matching the
 * spec's "re-generates automatically whenever performance data shifts
 * materially or the exam date changes".
 */

/**
 * Sections holding at least one approved question, for this exam.
 *
 * A plan built without this schedules topics the bank cannot serve, and
 * schedules them first — an unpractised section reads as 0%, therefore
 * weak, therefore front of the queue. See PlanUnit.covered.
 */
export async function coveredSectionIds(
  supabase: SupabaseClient,
  exam: string
): Promise<Set<number>> {
  const { data: sections } = await supabase
    .from("sections")
    .select("id")
    .eq("exam", exam);
  const ids = (sections ?? []).map((s) => s.id as number);
  if (ids.length === 0) return new Set();

  const { data } = await supabase
    .from("generated_questions")
    .select("section_id")
    .eq("status", "approved")
    .in("section_id", ids);
  return new Set((data ?? []).map((r) => r.section_id as number));
}

export type PlanResult =
  | { status: "needs_onboarding" }
  | {
      status: "ok";
      plan: StudyPlan;
      narrative: string;
      narrativeIsAI: boolean;
      units: PlanUnit[];
      examLabel: string;
      examDate: string;
    };

export async function getStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string
): Promise<PlanResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, exam_date")
    .eq("id", userId)
    .single();

  if (!profile?.exam || !profile?.exam_date) {
    return { status: "needs_onboarding" };
  }
  const examDate: string = profile.exam_date;
  const examLabel = EXAM_LABELS[profile.exam as ExamPart];

  const [{ data: sections }, { data: perf }, covered] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam),
    supabase
      .from("user_topic_performance")
      .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
      .eq("user_id", userId),
    coveredSectionIds(supabase, profile.exam),
  ]);

  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered
  );

  const fresh = buildStudyPlan(todayISO, examDate, units);
  const snapshot = fresh.meta.snapshot;

  // Latest stored plan for this user.
  const { data: stored } = await supabase
    .from("study_plans")
    .select("plan, narrative")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const storedPlan = stored?.plan as StudyPlan | undefined;
  const reusable =
    storedPlan &&
    storedPlan.meta.snapshot === snapshot &&
    // Also reuse only while the stored plan still covers today.
    storedPlan.weeks.some((w) => w.days.some((d) => d.date >= todayISO));

  if (reusable && stored) {
    return {
      status: "ok",
      plan: storedPlan!,
      narrative: stored.narrative ?? fallbackNarrative(storedPlan!, units),
      narrativeIsAI: Boolean(stored.narrative),
      units,
      examLabel,
      examDate,
    };
  }

  // Regenerate (material change, exam-date change, or first run).
  let narrative = stored?.narrative ?? null;
  let narrativeIsAI = false;
  if (units.length > 0 && fresh.weeks.length > 0) {
    const ai = await generatePlanNarrative(examLabel, fresh, units);
    if (ai) {
      narrative = ai;
      narrativeIsAI = true;
    }
  }
  const finalNarrative = narrative ?? fallbackNarrative(fresh, units);

  await supabase.from("study_plans").insert({
    user_id: userId,
    plan: fresh,
    narrative: narrativeIsAI ? finalNarrative : null,
  });

  return {
    status: "ok",
    plan: fresh,
    narrative: finalNarrative,
    narrativeIsAI,
    units,
    examLabel,
    examDate,
  };
}
