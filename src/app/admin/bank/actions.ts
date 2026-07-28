"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/**
 * Permanently delete approved questions (the guideline-update workflow:
 * a guideline is superseded, its questions are removed and regenerated
 * from the new version). Cascades to users' answer history for those
 * questions by design — an outdated question shouldn't keep counting.
 */
export async function deleteQuestions(ids: number[]) {
  if (ids.length === 0) return { error: "Nothing selected" };
  const { supabase } = await requireAdmin();

  const { error } = await supabase
    .from("generated_questions")
    .delete()
    .in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/admin/bank");
  return { deleted: ids.length };
}
