import { fetchAll } from "@/lib/supabase/all";
import {
  readiness,
  thirdBand,
  type Readiness,
  type ReadinessBand,
} from "@/lib/performance";
import { firstAttempts, type Attempt } from "@/lib/review";
import { overallReadiness } from "@/lib/readiness";
import { getReadinessModel } from "@/lib/readiness-model";
import type { PlanUnit } from "@/lib/studyPlan";
import type { ExamPart } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The four figures on the Today strip, read in one place.
 *
 * They are one thought — where this candidate stands — and they share
 * their data, so computing them together is both cheaper and the only
 * way they are guaranteed to agree with each other. Readiness needs to
 * know how many questions each section holds, to forgive its
 * confidence floor in the short ones; sections-complete needs the same
 * map; and questions-answered is the key set that answers both.
 *
 * Two paged reads. The bank is a couple of thousand rows of
 * {id, section_id} and the candidate's answers are at most one per
 * question in it, so both are small — but both can exceed a thousand
 * rows, and PostgREST would silently return the first thousand of
 * each. Capped, the bank total would freeze at 1,000 and every long
 * section would read as complete the moment its first thousand
 * questions were answered.
 */

export type Standing = {
  readiness: Readiness;
  /** Distinct questions answered, out of the approved bank. */
  questions: { answered: number; total: number; band: ReadinessBand };
  /**
   * Sections where every approved question has been answered, out of
   * the sections the bank can serve — and `syllabus`, which is every
   * leaf section whether or not questions exist for it yet.
   */
  sections: {
    complete: number;
    total: number;
    syllabus: number;
    band: ReadinessBand;
  };
};

/**
 * Readiness by guideline (lib/readiness), over the topics the plan
 * schedules. Falls back to the topic-level figure if the model cannot
 * be read, so the strip is never left without a number.
 */
export async function guidelineReadiness(
  exam: ExamPart,
  attempts: Attempt[],
  units: PlanUnit[],
  fallback: () => Readiness
): Promise<Readiness> {
  try {
    const model = await getReadinessModel(exam);
    const firstAnswers = new Map(firstAttempts(attempts).map((a) => [a.question_id, a.is_correct]));
    const servable = new Set(units.filter((u) => u.covered !== false).map((u) => u.section_id));
    const { topics: _topics, ...figure } = overallReadiness(model, firstAnswers, servable);
    return figure;
  } catch (error) {
    console.error("readiness model unavailable, topic-level figure used:", (error as Error)?.message);
    return fallback();
  }
}

export async function getStanding(
  supabase: SupabaseClient,
  userId: string,
  units: PlanUnit[],
  exam: ExamPart
): Promise<Standing> {
  const [bank, answers] = await Promise.all([
    fetchAll<{ id: string; section_id: number | null }>((from, to) =>
      supabase
        .from("generated_questions")
        .select("id, section_id")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
    ),
    fetchAll<{ question_id: number; is_correct: boolean; answered_at: string; id: number }>((from, to) =>
      supabase
        .from("user_answers")
        .select("id, question_id, is_correct, answered_at")
        .eq("user_id", userId)
        .order("id")
        .range(from, to)
    ),
  ]);

  const answered = new Set(answers.map((a) => String(a.question_id)));

  /* Per section: how many approved questions it holds, and how many of
     them this candidate has answered. */
  const held = new Map<number, number>();
  const done = new Map<number, number>();
  for (const q of bank) {
    if (q.section_id === null) continue;
    held.set(q.section_id, (held.get(q.section_id) ?? 0) + 1);
    if (answered.has(String(q.id))) {
      done.set(q.section_id, (done.get(q.section_id) ?? 0) + 1);
    }
  }

  const servable = units.filter((u) => u.covered !== false);
  const complete = servable.filter((u) => {
    const total = held.get(u.section_id) ?? 0;
    return total > 0 && (done.get(u.section_id) ?? 0) >= total;
  }).length;

  /* Counted against the bank rather than against the answer rows. A
     question retired after someone answered it would otherwise push
     the numerator above the denominator, and answers now include
     retries of questions got wrong, which are not further coverage. */
  const answeredInBank = bank.filter((q) => answered.has(String(q.id))).length;

  return {
    readiness: await guidelineReadiness(exam, answers, units, () => readiness(units, held)),
    questions: {
      answered: answeredInBank,
      total: bank.length,
      band: thirdBand(answeredInBank, bank.length),
    },
    sections: {
      complete,
      total: servable.length,
      syllabus: units.length,
      band: thirdBand(complete, servable.length),
    },
  };
}
