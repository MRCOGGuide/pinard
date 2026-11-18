import "server-only";
import { sessionIdFromToken } from "@/lib/jwt";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Make this sign-in the account's one active session (the one-device
 * rule): any other device is signed out by the middleware on its next
 * request. Written by the server, since candidates cannot write the
 * column themselves (phase58). Returns false when the token carries no
 * session id.
 */
export async function recordActiveSession(userId: string, accessToken: string | null | undefined): Promise<boolean> {
  const sessionId = sessionIdFromToken(accessToken ?? undefined);
  if (!sessionId) return false;
  await createAdminClient().from("profiles").update({ active_session_id: sessionId }).eq("id", userId);
  return true;
}
