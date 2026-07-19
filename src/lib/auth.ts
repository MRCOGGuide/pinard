import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Gate for the owner-facing admin area. Redirects anyone who is not
 * signed in as an admin. RLS enforces the same rule at the database,
 * so this is presentation-level protection on top of a hard floor.
 */
export async function requireAdmin() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return { supabase, user };
}
