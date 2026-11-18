import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Whether this is the account's password, checked without touching the
 * candidate's own sign-in: a separate client that keeps nothing, whose
 * one-off session is ended at once. Used before an action that cannot be
 * undone (deleting the account), so a computer left signed in is not
 * enough to do it (pre-launch review, 18 November 2026).
 */
export async function passwordMatches(email: string, password: string): Promise<boolean> {
  if (!password) return false;
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await check.auth.signInWithPassword({ email, password });
  if (error) return false;
  // Only the session this check opened; the candidate's own stays.
  await check.auth.signOut({ scope: "local" });
  return true;
}
