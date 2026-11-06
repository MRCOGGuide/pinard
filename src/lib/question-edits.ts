import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A copy of each edit made in Review, before and after (owner, 6 November
 * 2026: "review them too and see if these can be prevented in future"). The
 * table keeps only the latest text, so what was changed could not be read
 * back. A new file for each edit; a failure here must not stop the save.
 */
export async function keepEdit(id: number, before: unknown, after: unknown): Promise<void> {
  if (!before || JSON.stringify(before) === JSON.stringify(after)) return;
  const at = new Date().toISOString();
  await createAdminClient()
    .storage.from("sources")
    .upload(`questions/edits/${id}-${at.replace(/[:.]/g, "-")}.json`, new Blob([JSON.stringify({ id, at, before, after })], { type: "application/json" }), {
      contentType: "application/json",
    })
    .catch(() => null);
}
