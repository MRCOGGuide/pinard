import type { SupabaseClient } from "@supabase/supabase-js";
import { getStudyPlan } from "@/lib/plan-service";
import { weightedSessionAllocation, type PlanUnit } from "@/lib/studyPlan";
import { leafSections } from "@/lib/performance";
import {
  corePriorityShare,
  selectForSession,
  type Priority,
} from "@/lib/priority";
import type { QuestionFormat, QuestionOption, Section } from "@/lib/types";
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
  priority: Priority | null;
  sections: { title: string } | null;
};

const QUESTION_COLUMNS =
  "id, section_id, format, stem, options, correct_key, explanations, lead_in, priority, sections(title)";

/** Every question this candidate has already answered. */
export async function fetchSeenIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<number>> {
  const { data } = await supabase
    .from("user_answers")
    .select("question_id")
    .eq("user_id", userId);
  return new Set((data ?? []).map((r) => r.question_id as number));
}

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

/**
 * Approved questions for a section, chosen unseen-first and weighted
 * toward core guidance when the exam is close. `seenIds` empty means
 * "no history to avoid" (diagnostic, sampler).
 */
async function fetchApproved(
  supabase: SupabaseClient,
  sectionId: number,
  limit: number,
  seenIds: Set<number> = new Set(),
  coreShare = 0.5
): Promise<SessionQuestion[]> {
  if (limit <= 0) return [];
  const { data } = await supabase
    .from("generated_questions")
    .select(QUESTION_COLUMNS)
    .eq("status", "approved")
    .eq("section_id", sectionId)
    .limit(400);

  // Shuffle first so selection varies between sessions; the selector
  // then applies unseen-first and the core-priority share.
  const rows = shuffle((data ?? []) as unknown as QuestionRow[]);
  const chosen = selectForSession(
    rows.map((r) => ({ ...r, priority: (r.priority ?? 2) as Priority })),
    { size: limit, seenIds, coreShare }
  );
  return chosen.map(toSessionQuestion);
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

  // Closer to the exam → concentrate on the examined core; further out
  // → broader reading. Never repeat a question already answered while
  // unseen ones remain.
  const coreShare = corePriorityShare(plan.meta.days_remaining);
  const seenIds = await fetchSeenIds(supabase, userId);

  const titleById = new Map(units.map((u) => [u.section_id, u.title]));
  const questions: SessionQuestion[] = [];
  const focus: { title: string; count: number }[] = [];
  for (const a of allocation) {
    const picked = await fetchApproved(
      supabase,
      a.section_id,
      a.count,
      seenIds,
      coreShare
    );
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
  size = 10,
  userId?: string
): Promise<SessionQuestion[]> {
  // Off-plan practice should also serve fresh questions first.
  const seenIds = userId ? await fetchSeenIds(supabase, userId) : new Set<number>();
  return fetchApproved(supabase, sectionId, size, seenIds);
}

/**
 * Initial diagnostic (PROJECT.md item 3): up to DIAG_PER_SECTION approved
 * questions from every active topic of the exam, walked in syllabus order,
 * so results seed user_topic_performance across the board.
 */
const DIAG_PER_SECTION = 5;

export async function buildDiagnosticSession(
  supabase: SupabaseClient,
  exam: string
): Promise<SessionQuestion[]> {
  const { data: sections } = await supabase
    .from("sections")
    .select("*")
    .eq("exam", exam)
    .order("sort_order");
  const leaves = leafSections((sections ?? []) as Section[]);

  const questions: SessionQuestion[] = [];
  for (const section of leaves) {
    const picked = await fetchApproved(supabase, section.id, DIAG_PER_SECTION);
    questions.push(...picked);
  }
  return questions;
}

/** Free-tier sampler: a stable first-N of the section's approved questions. */
export async function buildSamplerSession(
  supabase: SupabaseClient,
  sectionId: number,
  limit: number
): Promise<SessionQuestion[]> {
  const { data } = await supabase
    .from("generated_questions")
    .select(QUESTION_COLUMNS)
    .eq("status", "approved")
    .eq("section_id", sectionId)
    .order("id", { ascending: true })
    .limit(limit);
  return ((data ?? []) as unknown as Parameters<typeof toSessionQuestion>[0][]).map(
    toSessionQuestion
  );
}
