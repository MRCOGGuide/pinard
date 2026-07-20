"use server";

import { createClient } from "@/lib/supabase/server";
import { sessionIdFromToken } from "@/lib/jwt";

/**
 * Records the current login as the account's single active session.
 * Call right after a successful sign-in/sign-up. Any other session
 * (another device or person) is then signed out by the middleware on
 * its next request.
 */
export async function claimActiveSession() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionId = sessionIdFromToken(session?.access_token);
  if (!sessionId) return;

  await supabase
    .from("profiles")
    .update({ active_session_id: sessionId })
    .eq("id", user.id);
}
