"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { SIMILAR_VALUES_ENABLED, writeFlag } from "@/lib/settings";

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

/**
 * Show or withhold the whole panel.
 *
 * Declining facts one group at a time is the right tool once the review
 * is under way, and the wrong one before it starts: until then every
 * unreviewed figure is in front of candidates and the only way to stop
 * it is to work through them. This is the switch that buys that time.
 */
export async function setSimilarValuesEnabled(enabled: boolean) {
  await requireAdmin();
  const result = await writeFlag(SIMILAR_VALUES_ENABLED, enabled);
  if (result.error) return result;
  // The panel is read on the session screen, not this one.
  revalidatePath("/admin/similar-values");
  revalidatePath("/session");
  revalidatePath("/practise");
  return {};
}
