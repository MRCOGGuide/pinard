import type { SupabaseClient } from "@supabase/supabase-js";
import { getStudyPlan } from "@/lib/plan-service";
import { weightedSessionAllocation, type PlanUnit } from "@/lib/studyPlan";
import type { QuestionFormat, QuestionOption } from "@/lib/types";
import type { GeneratedExplanation } from "@/lib/generation";

/**
 * Builds practice sessions from approved questions. The daily session
 * uses the plan's sections for today with the (70 − accuracy) selection
 * weighting; free revision draws from a single chosen section.
 */

export type SessionQuestion = {
  id: number;
  section_id: number;
  section_title: string;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  explanations: GeneratedExplanation[];
  lead_in: string | null;
};

const DAILY_SIZE = 10;

type QuestionRow = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  explanations: GeneratedExplanation[];
  lead_in: string | null;
  sections: { title: string } | null;
};

function toSessionQuestion(row: QuestionRow): SessionQuestion {
  return {
    id: row.id,
    section_id: row.section_id,
    section_title: row.sections?.title ?? "",
    format: row.format,
    stem: row.stem,
    options: row.options,
    correct_key: row.correct_key,
    explanations: row.explanations,
    lead_in: row.lead_in,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function fetchApproved(
  supabase: SupabaseClient,
  sectionId: number,
  limit: number
): Promise<SessionQuestion[]> {
  if (limit <= 0) return [];
  const { data } = await supabase
    .from("generated_questions")
    .select(
      "id, section_id, format, stem, options, correct_key, explanations, lead_in, sections(title)"
    )
    .eq("status", "approved")
    .eq("section_id", sectionId)
    .limit(50);
  const rows = shuffle((data ?? []) as unknown as QuestionRow[]).slice(0, limit);
  return rows.map(toSessionQuestion);
}

export type DailySession =
  | { status: "needs_onboarding" }
  | {
      status: "ok";
      questions: SessionQuestion[];
      examLabel: string;
      daysRemaining: number;
      focus: { title: string; count: number }[];
    };

export async function buildDailySession(
  supabase: SupabaseClient,
  userId: string,
  todayISO: string
): Promise<DailySession> {
  const planResult = await getStudyPlan(supabase, userId, todayISO);
  if (planResult.status === "needs_onboarding") return { status: "needs_onboarding" };

  const { plan, units, examLabel } = planResult;

  // Today's plan day (may be absent on the exam day itself).
  const todayDay = plan.weeks
    .flatMap((w) => w.days)
    .find((d) => d.date === todayISO);
  const focusIds = new Set(
    todayDay ? todayDay.items.map((i) => i.section_id) : units.map((u) => u.section_id)
  );
  const focusUnits: PlanUnit[] = units.filter((u) => focusIds.has(u.section_id));

  const allocation = weightedSessionAllocation(
    focusUnits.length ? focusUnits : units,
    DAILY_SIZE
  );

  const titleById = new Map(units.map((u) => [u.section_id, u.title]));
  const questions: SessionQuestion[] = [];
  const focus: { title: string; count: number }[] = [];
  for (const a of allocation) {
    const picked = await fetchApproved(supabase, a.section_id, a.count);
    if (picked.length > 0) {
      focus.push({ title: titleById.get(a.section_id) ?? "", count: picked.length });
    }
    questions.push(...picked);
  }

  return {
    status: "ok",
    questions: shuffle(questions),
    examLabel,
    daysRemaining: plan.meta.days_remaining,
    focus,
  };
}

export async function buildRevisionSession(
  supabase: SupabaseClient,
  sectionId: number,
  size = 10
): Promise<SessionQuestion[]> {
  return fetchApproved(supabase, sectionId, size);
}
