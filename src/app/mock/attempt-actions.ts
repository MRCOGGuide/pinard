"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MarkedPaper, SectionScore } from "@/lib/mock";

/**
 * Keep, read and clear the record of a candidate's mock sittings.
 *
 * The answers themselves are in user_answers and count towards the
 * topic map exactly as practice answers do. This is the paper's own
 * result, which is a different thing: marked on a different scale,
 * and gone the moment the page closes unless it is written down.
 */

export type MockAttempt = {
  satAt: string;
  secondsTaken: number | null;
  marked: MarkedPaper;
  sections: SectionScore[];
};

export async function recordMockAttempt(input: {
  marked: MarkedPaper;
  sections: SectionScore[];
  secondsTaken: number;
}): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase.from("mock_attempts").insert({
    user_id: user.id,
    seconds_taken: Math.max(0, Math.round(input.secondsTaken)),
    sba_correct: input.marked.sbaCorrect,
    sba_total: input.marked.sbaTotal,
    emq_correct: input.marked.emqCorrect,
    emq_total: input.marked.emqTotal,
    percent: input.marked.percent,
    passed: input.marked.passed,
    sections: input.sections,
  });
  /*
    A failure here must not lose the paper. The candidate has just sat
    three hours and is about to be shown their mark, which is computed
    in the page and does not depend on this row existing; all that is
    lost is the history. So it is reported and not thrown.
  */
  if (error) return { error: error.message };

  revalidatePath("/mock");
  return {};
}

/** Every sitting, newest first, for the paper's own feedback. */
export async function listMockAttempts(): Promise<MockAttempt[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("mock_attempts")
    .select(
      "sat_at, seconds_taken, sba_correct, sba_total, emq_correct, emq_total, percent, passed, sections"
    )
    .eq("user_id", user.id)
    .order("sat_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((row) => ({
    satAt: row.sat_at as string,
    secondsTaken: (row.seconds_taken as number | null) ?? null,
    marked: {
      sbaCorrect: row.sba_correct as number,
      sbaTotal: row.sba_total as number,
      emqCorrect: row.emq_correct as number,
      emqTotal: row.emq_total as number,
      percent: Number(row.percent),
      passed: row.passed as boolean,
      /* The threshold is not stored: it is the product's, not the
         sitting's, and a pass mark that moved should move every row
         with it rather than leaving old papers judged by an old line.
         `passed` is kept as it was decided at the time. */
      passMark: 0,
    },
    sections: (row.sections ?? []) as SectionScore[],
  }));
}

/**
 * Clear the mock record, and only the mock record.
 *
 * Scores back to nothing, ready to sit again. The answers stay in
 * user_answers, so readiness, the topic map, coverage, the returning
 * questions and the streak are all untouched: this is the one feature
 * being reset, not the candidate's history with the product.
 */
export async function resetMockAttempts(): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("mock_attempts")
    .delete()
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/mock");
  return {};
}
