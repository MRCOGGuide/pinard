"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** A whole number inside a range, for figures that arrive from the page. */
function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  /* Written by the server (candidates can no longer write this table
     themselves, security audit L1), with every figure held to the
     shape of a real paper. */
  const sbaTotal = clampInt(input.marked?.sbaTotal, 0, 200);
  const emqTotal = clampInt(input.marked?.emqTotal, 0, 200);
  const { error } = await createAdminClient().from("mock_attempts").insert({
    user_id: user.id,
    seconds_taken: clampInt(input.secondsTaken, 0, 6 * 3600),
    sba_correct: clampInt(input.marked?.sbaCorrect, 0, sbaTotal),
    sba_total: sbaTotal,
    /* Rounded: sets can be earned in fractions and the column is an
       integer. The percent beside it is computed from the exact
       figure, so the mark never moves because the tally was rounded
       for storage. */
    emq_correct: clampInt(input.marked?.emqCorrect, 0, emqTotal),
    emq_total: emqTotal,
    percent: clampInt(input.marked?.percent, 0, 100),
    passed: Boolean(input.marked?.passed),
    sections: Array.isArray(input.sections) ? input.sections.slice(0, 100) : [],
  });
  /*
    A failure here must not lose the paper. The candidate has just sat
    three hours and is about to be shown their mark, which is computed
    in the page and does not depend on this row existing; all that is
    lost is the history. So it is reported and not thrown.
  */
  if (error) {
    console.error("recordMockAttempt failed:", error.code);
    return { error: "Your mark is shown, but it could not be added to your history." };
  }

  revalidatePath("/mock");
  return {};
}

/** Every sitting, newest first, for the paper's own feedback. */
export async function listMockAttempts(): Promise<MockAttempt[]> {
  const supabase = await createClient();
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // The candidate's own papers only, deleted by the server on their
  // behalf, at their request (they confirm in a dialog first).
  const { error } = await createAdminClient()
    .from("mock_attempts")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    console.error("resetMockAttempts failed:", error.code);
    return { error: "Your scores could not be cleared just now. Try again." };
  }

  revalidatePath("/mock");
  return {};
}
