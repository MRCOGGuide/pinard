"use server";

import { createClient } from "@/lib/supabase/server";
import { saveFeedback } from "@/lib/pilot";

/**
 * A sentence from someone using the product, with the page they were
 * on when they wrote it.
 *
 * Signed in only: an open box on a public page is a spam target, and
 * the feedback worth having comes from people who are inside.
 */
export async function sendFeedback(input: {
  message: string;
  path: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  return saveFeedback({
    userId: user.id,
    path: input.path,
    message: input.message,
  });
}
