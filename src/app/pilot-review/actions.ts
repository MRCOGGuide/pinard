"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isReviewOpen, saveReview, validateReview, type PilotReview } from "@/lib/pilotReview";

export async function submitPilotReview(input: PilotReview): Promise<{ error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to send your review." };
  if (!(await isReviewOpen())) return { error: "The pilot review is closed." };

  const { review, error } = validateReview(input);
  if (error || !review) return { error: error ?? "Check the form and try again." };

  const result = await saveReview(user.id, review);
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/pilot-review");
    revalidatePath("/admin/pilot");
  }
  return result;
}
