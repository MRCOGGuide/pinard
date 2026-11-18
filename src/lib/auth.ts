import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safeNext";

/**
 * Send a signed-out visitor to sign in, remembering the page they asked
 * for (the middleware puts it in x-pathname) so they come back to it.
 */
export async function redirectToSignIn(): Promise<never> {
  // Next.js 15: headers() is async. Callers `return` this so TypeScript
  // still knows the user is signed in on the lines after it.
  const next = safeNext((await headers()).get("x-pathname"));
  redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
}

/**
 * Gate for the owner-facing admin area. Redirects anyone who is not
 * signed in as an admin.
 *
 * Called by the admin layout AND by every admin page and action: a
 * layout is not re-run on a client navigation between pages it wraps,
 * so a page that reads with full rights must check for itself (pre-
 * launch review, 18 November 2026). Many admin pages read through the
 * service role, which RLS does not restrict, so this check is the gate.
 * Shared within one request (React cache), so the layout and the page
 * ask the database once.
 */
export const requireAdmin = cache(async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  return { supabase, user };
});
