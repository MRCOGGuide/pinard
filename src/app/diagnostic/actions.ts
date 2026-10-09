"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeDiagnostic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("profiles")
    .update({ diagnostic_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    // The detail goes to the log, not the screen (security audit M6).
    console.error("diagnostic action failed:", error.code);
    return { error: "Your diagnostic could not be saved. Try again." };
  }

  revalidatePath("/", "layout");
  return {};
}
