import { fetchAll } from "@/lib/supabase/all";
import {
  readiness,
  thirdBand,
  type Readiness,
  type ReadinessBand,
} from "@/lib/performance";
import type { PlanUnit } from "@/lib/studyPlan";
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

export async function getStanding(
  supabase: SupabaseClient,
  userId: string,
  units: PlanUnit[]
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
    fetchAll<{ question_id: string }>((from, to) =>
      supabase
        .from("user_answers")
        .select("question_id")
        .eq("user_id", userId)
        .order("question_id")
        .range(from, to)
    ),
  ]);

  const answered = new Set(answers.map((a) => a.question_id));

  /* Per section: how many approved questions it holds, and how many of
     them this candidate has answered. */
  const held = new Map<number, number>();
  const done = new Map<number, number>();
  for (const q of bank) {
    if (q.section_id === null) continue;
    held.set(q.section_id, (held.get(q.section_id) ?? 0) + 1);
    if (answered.has(q.id)) {
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
  const answeredInBank = bank.filter((q) => answered.has(q.id)).length;

  return {
    readiness: readiness(units, held),
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
