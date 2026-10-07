import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

/**
 * Send a signed-out visitor to sign in, remembering the page they asked
 * for (the middleware puts it in x-pathname) so they come back to it.
 */
export function redirectToSignIn(): never {
  const next = safeNext(headers().get("x-pathname"));
  redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
}

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
  if (!user) redirectToSignIn();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return { supabase, user };
}
