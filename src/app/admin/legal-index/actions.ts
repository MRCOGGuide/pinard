"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * The owner's verdict on one entry of the legal index, with any change
 * to what it says the law establishes. Only an approved entry is used by
 * Ask Pinard; "not needed" leaves out one that has no bearing on the
 * specialty.
 */
export async function reviewLegalEntry(input: {
  id: number;
  status: "approved" | "needs_changes" | "rejected" | "draft";
  establishes: string;
  note: string;
}): Promise<{ error?: string }> {
  await requireAdmin();
  if (!["approved", "needs_changes", "rejected", "draft"].includes(input.status)) return { error: "Choose a verdict." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await createAdminClient()
    .from("legal_index")
    .update({
      status: input.status,
      establishes: String(input.establishes ?? "").slice(0, 2000),
      owner_note: String(input.note ?? "").slice(0, 4000) || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(input.id));
  if (error) return { error: "The review could not be saved." };
  revalidatePath("/admin/legal-index");
  revalidatePath(`/admin/legal-index/${input.id}`);
  return {};
}

/** Every entry still waiting, approved at once. One already reviewed is left as it is. */
export async function approveAllLegalEntries(): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("legal_index")
    .update({ status: "approved", reviewed_at: now, reviewed_by: user?.id ?? null, updated_at: now })
    .eq("status", "draft");
  if (error) return { error: "The entries could not be approved." };
  revalidatePath("/admin/legal-index");
  return {};
}
