import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStudyPlan, type StudyPlan, type PlanUnit } from "@/lib/studyPlan";
import { buildPlanUnits, type PerfRow } from "@/lib/performance";
import { fetchAll } from "@/lib/supabase/all";
import { createAdminClient } from "@/lib/supabase/admin";
import { fallbackNarrative, generatePlanNarrative } from "@/lib/narrative";
import { EXAM_LABELS, type ExamPart, type Section } from "@/lib/types";
import { dailyQuestionsFor, isConfidence, type Confidence } from "@/lib/confidence";
import { getReadinessModel } from "@/lib/readiness-model";

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
  return (await bankShape(supabase, exam)).covered;
}

/**
 * What the bank holds for this exam, per section: whether it has any
 * approved question (`covered`), and how many guidelines its questions
 * are written from (`breadth`, for lib/performance sureAtFor). One read
 * serves both.
 */
export async function bankShape(
  supabase: SupabaseClient,
  exam: string
): Promise<{ covered: Set<number>; breadth: Map<number, number> }> {
  const { data: sections } = await supabase
    .from("sections")
    .select("id")
    .eq("exam", exam);
  const ids = (sections ?? []).map((s) => s.id as number);
  if (ids.length === 0) return { covered: new Set(), breadth: new Map() };

  /*
    Paged. This read a thousand rows and stopped, because PostgREST
    caps a response there and reports no error, and the bank passed a
    thousand approved questions some time ago. Every section whose
    questions all happened to sort beyond row 1000 came back as one
    the bank cannot serve.

    The cost was not cosmetic. `covered: false` is what tells the
    planner a topic has nothing to practise, so those sections were
    being left out of candidates' study plans altogether, and left out
    of the readiness denominator, while the Practise screen — which
    pages properly — listed them with questions in them. That
    disagreement is what showed it: 35 topics there against 31 here.
  */
  // Ordered by id: a page boundary inside a run of equal section ids could
  // otherwise repeat or drop rows between pages.
  const rows = await fetchAll<{ section_id: number; source_document_ids: number[] | null }>((from, to) =>
    supabase
      .from("generated_questions")
      .select("section_id, source_document_ids")
      .eq("status", "approved")
      .in("section_id", ids)
      .order("id")
      .range(from, to)
  );
  const docs = new Map<number, Set<number>>();
  for (const r of rows) {
    const set = docs.get(r.section_id) ?? new Set<number>();
    for (const d of r.source_document_ids ?? []) set.add(d);
    docs.set(r.section_id, set);
  }
  return {
    covered: new Set(docs.keys()),
    breadth: new Map([...docs].map(([section, set]) => [section, set.size])),
  };
}

/**
 * Facts each topic's guidelines hold, from the readiness model (cached),
 * so the plan and readiness measure a topic's size the same way. Empty
 * if the model cannot be read: every topic then comes round once, as
 * before.
 */
async function factsByTopic(exam: ExamPart): Promise<Map<number, number>> {
  try {
    const model = await getReadinessModel(exam);
    const facts = new Map<number, number>();
    for (const g of model.guidelines) facts.set(g.section_id, (facts.get(g.section_id) ?? 0) + g.facts);
    return facts;
  } catch (error) {
    console.error("topic facts unavailable, every topic once:", (error as Error)?.message);
    return new Map();
  }
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
      exam: ExamPart;
      examDate: string;
      /** Questions a day the candidate has time for: the session size, and each day's total. */
      dailyQuestions: number;
      /** How many topics the candidate has rated. */
      rated: number;
    };

export async function getStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string,
  options: {
    /**
     * Whether the Claude-written narrative may be generated if the plan
     * is being rebuilt. Off for callers that only want the allocation:
     * a session takes `plan` and `units` and never reads `narrative`,
     * so generating it there put a model call on the critical path of a
     * screen that throws the result away.
     */
    narrative?: boolean;
  } = {}
): Promise<PlanResult> {
  // "*": study_hours_per_week arrives with phase55, and a column not yet
  // there must not send a candidate back to onboarding.
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!profile?.exam || !profile?.exam_date) {
    return { status: "needs_onboarding" };
  }
  const examDate: string = profile.exam_date;
  const examLabel = EXAM_LABELS[profile.exam as ExamPart];
  const dailyQuestions = dailyQuestionsFor(profile.study_hours_per_week as number | null | undefined);

  const [{ data: sections }, { data: perf }, { covered, breadth }, { data: ratingRows }, topicFacts] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam),
    supabase
      .from("user_topic_performance")
      .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
      .eq("user_id", userId),
    bankShape(supabase, profile.exam),
    // Absent until phase55 is run, when this errors and reads as no ratings.
    supabase.from("section_confidence").select("section_id, confidence").eq("user_id", userId),
    // Facts per topic, for how often each comes round (lib/performance visitsFor); without them, once each.
    factsByTopic(profile.exam as ExamPart),
  ]);
  const ratings = new Map<number, Confidence>();
  for (const r of (ratingRows ?? []) as { section_id: number; confidence: unknown }[]) {
    if (isConfidence(r.confidence)) ratings.set(Number(r.section_id), r.confidence);
  }

  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered,
    ratings,
    breadth,
    topicFacts
  );

  const fresh = buildStudyPlan(todayISO, examDate, units, dailyQuestions);
  const snapshot = fresh.meta.snapshot;

  /*
    Whether anything is known about this candidate yet. With no answers
    every topic reads 0% and weak, and the written briefing named three
    of them as "your weakest" on nothing at all (owner, 16 November 2026:
    a plan that has not seen the diagnostic should say it is generic).
    Until there is an answer the briefing is the fixed text that says so,
    and no model is asked to describe what it cannot know.
  */
  // Ratings count as something known: the brief can then say what they put first.
  const answered = units.some((u) => (u.attempts ?? 0) > 0) || ratings.size > 0;

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
    /*
      The stored plan is reused for as long as nothing material changes,
      which can be days, but its days_remaining was frozen on the day it
      was built: Today, the plan page and the reminder all showed the
      count from then. The count is today's, always; and the briefing
      written that day has its "N days" brought up to date with it.
    */
    const liveDays = fresh.meta.days_remaining;
    const frozenDays = storedPlan!.meta.days_remaining;
    const plan: StudyPlan = {
      ...storedPlan!,
      meta: { ...storedPlan!.meta, days_remaining: liveDays },
    };
    const narrative =
      stored.narrative && frozenDays !== liveDays
        ? stored.narrative.replace(new RegExp(`\\b${frozenDays}(?=\\s+days?\\b)`, "g"), String(liveDays))
        : stored.narrative;
    return {
      status: "ok",
      plan,
      narrative: answered ? (narrative ?? fallbackNarrative(plan, units)) : fallbackNarrative(plan, units),
      narrativeIsAI: answered && Boolean(stored.narrative),
      units,
      examLabel,
      exam: profile.exam as ExamPart,
      examDate,
      dailyQuestions,
      rated: ratings.size,
    };
  }

  // Regenerate (material change, exam-date change, or first run).
  let narrative = answered ? (stored?.narrative ?? null) : null;
  let narrativeIsAI = false;
  if (answered && options.narrative !== false && units.length > 0 && fresh.weeks.length > 0) {
    const ai = await generatePlanNarrative(examLabel, fresh, units);
    if (ai) {
      narrative = ai;
      narrativeIsAI = true;
    }
  }
  const finalNarrative = narrative ?? fallbackNarrative(fresh, units);

  // Stored by the server: candidates can no longer write plans
  // themselves (security audit L1).
  await createAdminClient().from("study_plans").insert({
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
    exam: profile.exam as ExamPart,
    examDate,
    dailyQuestions,
    rated: ratings.size,
  };
}
