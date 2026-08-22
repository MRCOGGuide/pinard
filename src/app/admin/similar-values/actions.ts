"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/**
 * Facts are usable until declined, so declining is the act recorded
 * here. A declined fact stays in the store and can still ground a
 * question — it is only withheld from the Similar Values panel, where
 * an out-of-context figure is worse than no figure.
 *
 * Bulk by design: the judgement is made while reading a value group as
 * a whole ("everything that is 1%"), and most groups have several facts
 * to drop at once.
 */
export async function setFactsExcluded(ids: number[], excluded: boolean) {
  if (ids.length === 0) return {};
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("key_facts")
    .update({
      similar_excluded: excluded,
      similar_reviewed_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (error) return { error: error.message };
  revalidatePath("/admin/similar-values");
  return {};
}

/** Stamp a whole value group as looked at, so progress is visible. */
export async function markGroupReviewed(ids: number[]) {
  if (ids.length === 0) return {};
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("key_facts")
    .update({ similar_reviewed_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { error: error.message };
  revalidatePath("/admin/similar-values");
  return {};
}
