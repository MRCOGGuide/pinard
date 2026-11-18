"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Promote or demote a user. Guards against changing your own role. */
export async function setUserRole(userId: string, makeAdmin: boolean) {
  const { user } = await requireAdmin();
  if (userId === user.id) {
    return { error: "You can't change your own role here." };
  }
  // Through the server's own client: signed-in accounts, admins included,
  // can update only a named list of profile columns (phase58).
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ role: makeAdmin ? "admin" : "user" })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return {};
}
