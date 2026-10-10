"use server";

import { createClient } from "@/lib/supabase/server";
import { sessionIdFromToken } from "@/lib/jwt";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipCountry } from "@/lib/region";

/**
 * Records the current login as the account's single active session.
 * Call right after a successful sign-in/sign-up. Any other session
 * (another device or person) is then signed out by the middleware on
 * its next request.
 */
export async function claimActiveSession() {
  const supabase = await createClient();
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

  /*
    The country this sign-in came from, by day, for the account-sharing
    flags in Admin (pricing Phase 2). The country only, never the IP
    address. Flags are for the owner to look at; nothing is automatic,
    because travel is legitimate. Skipped quietly until phase45 is run.
  */
  try {
    const country = await ipCountry();
    if (country) {
      await createAdminClient().rpc("record_signin_country", { p_user_id: user.id, p_country: country });
    }
  } catch {
    // Never in the way of signing in.
  }
}
