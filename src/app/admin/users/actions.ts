"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

/** Promote or demote a user. Guards against changing your own role. */
export async function setUserRole(userId: string, makeAdmin: boolean) {
  const { supabase, user } = await requireAdmin();
  if (userId === user.id) {
    return { error: "You can't change your own role here." };
  }
  const { error } = await supabase
    .from("profiles")
    .update({ role: makeAdmin ? "admin" : "user" })
    .eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return {};
}
