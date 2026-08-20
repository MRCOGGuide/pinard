import type { SupabaseClient } from "@supabase/supabase-js";
import { groupIntoItems } from "@/lib/emq";
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

/** What a candidate is shown about where a question came from. */
export type QuestionSource = {
  title: string;
  year: number | null;
  reference: string;
  togYear: number | null;
  togIssue: number | null;
};

export type SessionQuestion = {
  id: number;
  section_id: number;
  section_title: string;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  /** The paragraph shown under the card; null on pre-Phase-16 questions. */
  explanation: string | null;
  explanations: GeneratedExplanation[];
  lead_in: string | null;
  /** EMQ only: scenarios of one set share this id and are shown together. */
  emq_group_id: string | null;
  sources: QuestionSource[];
};

const DAILY_SIZE = 10;

type QuestionRow = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  explanation: string | null;
  explanations: GeneratedExplanation[];
  lead_in: string | null;
  emq_group_id: string | null;
  priority: Priority | null;
  source_document_ids: number[] | null;
  sections: { title: string } | null;
};

const QUESTION_COLUMNS =
  "id, section_id, format, stem, options, correct_key, explanation, explanations, lead_in, emq_group_id, priority, source_document_ids, sections(title)";

/**
 * Attach the documents each question was written from, so the card can
 * show candidates exactly which guideline (and TOG issue) it came from.
 */
async function attachSources(
  supabase: SupabaseClient,
  questions: SessionQuestion[],
  rows: QuestionRow[]
): Promise<SessionQuestion[]> {
  const docIds = Array.from(
    new Set(rows.flatMap((r) => r.source_document_ids ?? []))
  );
  if (docIds.length === 0) return questions;

  const { data } = await supabase
    .from("content_documents")
    .select("id, title, source_year, source_reference, tog_year, tog_issue")
    .in("id", docIds);

  const byId = new Map(
    ((data ?? []) as {
      id: number;
      title: string;
      source_year: number | null;
      source_reference: string | null;
      tog_year: number | null;
      tog_issue: number | null;
    }[]).map((d) => [
      d.id,
      {
        title: d.title,
        year: d.source_year,
        reference: d.source_reference ?? "",
        togYear: d.tog_year,
        togIssue: d.tog_issue,
      } as QuestionSource,
    ])
  );

  const sourcesByQuestion = new Map(
    rows.map((r) => [
      r.id,
      (r.source_document_ids ?? [])
        .map((id) => byId.get(id))
        .filter((s): s is QuestionSource => Boolean(s)),
    ])
  );

  return questions.map((q) => ({
    ...q,
    sources: sourcesByQuestion.get(q.id) ?? [],
  }));
}

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
    explanation: row.explanation,
    explanations: row.explanations,
    lead_in: row.lead_in,
    emq_group_id: row.emq_group_id,
    sources: [],
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
 * Shuffle without breaking EMQ sets apart. A set's scenarios are only
 * answerable against their shared option list, so they travel together
 * and keep their internal order; sets are shuffled among the singles.
 */
function shuffleKeepingSets(questions: SessionQuestion[]): SessionQuestion[] {
  return shuffle(groupIntoItems(questions)).flatMap((item) =>
    item.kind === "single" ? [item.question] : item.scenarios
  );
}

/**
 * Complete any EMQ set the selector picked only part of.
 *
 * `selectForSession` works on individual rows and knows nothing about
 * sets, so it will happily take 2 scenarios of a 4-scenario set. Half a
 * set cannot be presented, so pull in the missing siblings. This can
 * push a session slightly over its target size — a whole set is worth
 * more than an exact count.
 */
function completeSets(
  chosen: QuestionRow[],
  pool: QuestionRow[]
): QuestionRow[] {
  const wantedGroups = new Set(
    chosen
      .filter((r) => r.format === "emq" && r.emq_group_id)
      .map((r) => r.emq_group_id as string)
  );
  if (wantedGroups.size === 0) return chosen;

  const picked = new Set(chosen.map((r) => r.id));
  const completed = [...chosen];
  for (const row of pool) {
    if (picked.has(row.id)) continue;
    if (row.emq_group_id && wantedGroups.has(row.emq_group_id)) {
      completed.push(row);
      picked.add(row.id);
    }
  }
  return completed;
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
  const selected = selectForSession(
    rows.map((r) => ({ ...r, priority: (r.priority ?? 2) as Priority })),
    { size: limit, seenIds, coreShare }
  );
  // Never serve half an EMQ set.
  const chosen = completeSets(selected, rows);
  return attachSources(supabase, chosen.map(toSessionQuestion), chosen);
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
    questions: shuffleKeepingSets(questions),
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
  const rows = (data ?? []) as unknown as QuestionRow[];
  return attachSources(supabase, rows.map(toSessionQuestion), rows);
}

/** Question ids this candidate has flagged, newest first. */
export async function fetchFlaggedIds(
  supabase: SupabaseClient,
  userId: string
): Promise<number[]> {
  const { data } = await supabase
    .from("user_question_flags")
    .select("question_id")
    .eq("user_id", userId)
    .order("flagged_at", { ascending: false });
  return (data ?? []).map((r) => r.question_id as number);
}

/**
 * Everything the candidate has flagged, newest flag first. Unlike the
 * other builders this deliberately ignores what they have already seen:
 * a flagged question is one they asked to come back to.
 *
 * EMQ scenarios are pulled in as whole sets — flagging one scenario and
 * being shown it without its option list would be useless — so the
 * result can contain unflagged siblings of a flagged scenario.
 */
export async function buildFlaggedSession(
  supabase: SupabaseClient,
  userId: string
): Promise<SessionQuestion[]> {
  const flagged = await fetchFlaggedIds(supabase, userId);
  if (flagged.length === 0) return [];

  const { data: direct } = await supabase
    .from("generated_questions")
    .select(QUESTION_COLUMNS)
    .eq("status", "approved")
    .in("id", flagged);
  let rows = (direct ?? []) as unknown as QuestionRow[];

  const groupIds = Array.from(
    new Set(rows.map((r) => r.emq_group_id).filter((g): g is string => Boolean(g)))
  );
  if (groupIds.length > 0) {
    const { data: siblings } = await supabase
      .from("generated_questions")
      .select(QUESTION_COLUMNS)
      .eq("status", "approved")
      .in("emq_group_id", groupIds);
    const byId = new Map<number, QuestionRow>();
    for (const row of [...rows, ...((siblings ?? []) as unknown as QuestionRow[])]) {
      byId.set(row.id, row);
    }
    rows = Array.from(byId.values());
  }

  // Newest flag first, with each EMQ set placed at its earliest flag.
  const rank = new Map(flagged.map((id, i) => [id, i]));
  const rankOf = (row: QuestionRow) =>
    rank.has(row.id) ? rank.get(row.id)! : Number.MAX_SAFE_INTEGER;
  const groupRank = new Map<string, number>();
  for (const row of rows) {
    if (!row.emq_group_id) continue;
    const best = Math.min(groupRank.get(row.emq_group_id) ?? Infinity, rankOf(row));
    groupRank.set(row.emq_group_id, best);
  }
  rows.sort(
    (a, b) =>
      (a.emq_group_id ? groupRank.get(a.emq_group_id)! : rankOf(a)) -
      (b.emq_group_id ? groupRank.get(b.emq_group_id)! : rankOf(b))
  );

  return attachSources(supabase, rows.map(toSessionQuestion), rows);
}
