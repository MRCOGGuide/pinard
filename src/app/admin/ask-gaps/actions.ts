"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** The owner's verdict on a gap, for every time it was logged. */
export async function setGapStatus(ids: number[], status: "open" | "added" | "not_a_gap"): Promise<{ error?: string }> {
  await requireAdmin();
  if (!["open", "added", "not_a_gap"].includes(status)) return { error: "Choose what to do with it." };
  const { error } = await createAdminClient().from("ask_gaps").update({ status }).in("id", ids.map(Number));
  if (error) return { error: "That could not be saved." };
  revalidatePath("/admin/ask-gaps");
  return {};
}
