"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The owner's verdict on one decision aid. Only an approved aid is
 * followed by Ask Pinard; "needs changes" holds it back with a note
 * saying what the transcription got wrong; "rejected" says it is not a
 * decision aid at all (an evidence table read as one, say).
 */
export async function reviewAid(input: {
  id: number;
  status: "approved" | "needs_changes" | "rejected" | "draft";
  note: string;
}): Promise<{ error?: string }> {
  await requireAdmin();
  if (!["approved", "needs_changes", "rejected", "draft"].includes(input.status)) return { error: "Choose a verdict." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await createAdminClient()
    .from("decision_aids")
    .update({
      status: input.status,
      owner_note: String(input.note ?? "").slice(0, 4000) || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(input.id));
  if (error) return { error: "The review could not be saved." };
  revalidatePath("/admin/decision-aids");
  revalidatePath(`/admin/decision-aids/${input.id}`);
  return {};
}
