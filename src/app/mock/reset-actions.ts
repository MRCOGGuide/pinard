"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Throw away everything this candidate has answered, and start again.
 *
 * Irreversible, and wider than it may look from the button: answers
 * are what every other figure is computed from, so this clears the
 * readiness score, the topic map, the coverage bars, the spaced-retry
 * queue and the streak at the same time. The study plan rebuilds
 * itself from nothing on the next load.
 *
 * The diagnostic lock goes with it. Resetting and then being told the
 * diagnostic reopens in three weeks would leave someone with no
 * scores and no way to take the one thing designed to produce them.
 *
 * Only ever the signed-in user's own rows. There is no argument for
 * whose data to delete, because there is no case where that should be
 * anyone's choice but their own.
 */
export async function resetAllScores(): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error: answersError } = await supabase
    .from("user_answers")
    .delete()
    .eq("user_id", user.id);
  if (answersError) return { error: answersError.message };

  /* The topic map is a cache of the answers, so it has to go with
     them. Left behind it would report accuracy for a candidate with
     no answers to their name. */
  const { error: perfError } = await supabase
    .from("user_topic_performance")
    .delete()
    .eq("user_id", user.id);
  if (perfError) return { error: perfError.message };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ diagnostic_completed_at: null })
    .eq("id", user.id);
  if (profileError) return { error: profileError.message };

  revalidatePath("/", "layout");
  return {};
}
