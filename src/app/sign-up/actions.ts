"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkInviteCode,
  joinWaitlist,
  redeemInviteCode,
} from "@/lib/pilot";
import { requestIp, visitorKey } from "@/lib/gate";

/**
 * A pilot account, made by the server after it has checked the invite.
 *
 * Security audit M7. The browser used to check the code and then call
 * supabase.auth.signUp itself, so anyone could skip the check and sign
 * up straight through the Supabase API. Now the account is created here,
 * only for a live code, which lets the owner switch off "Allow new users
 * to sign up" in Supabase: that closes the public API, and this path
 * (the admin API) keeps working.
 *
 * The address is marked confirmed: the invite code is the proof of
 * welcome here, and the browser signs in with the password straight
 * after.
 */
export async function createPilotAccount(input: {
  name: string;
  email: string;
  password: string;
  invite: string;
}): Promise<{ error?: string }> {
  const name = String(input.name ?? "").trim().slice(0, 100);
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  if (!name) return { error: "Enter your name." };
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That does not look like an email address." };
  }
  if (password.length < 8 || password.length > 72) {
    return { error: "Choose a password of 8 to 72 characters." };
  }

  const check = await checkInviteCode(input.invite);
  if (!check.ok || !check.code) return { error: check.reason ?? "That code is not one of ours." };

  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? "")) {
      return { error: "There is already an account with that email. Sign in instead." };
    }
    console.error("createPilotAccount failed:", error?.status ?? "no user");
    return { error: "Your account could not be created just now. Try again." };
  }

  await redeemInviteCode(check.code, data.user.id);
  return {};
}

/** Five waitlist sign-ups per visitor per hour (security audit L3). */
const WAITLIST_PER_HOUR = 5;

export async function joinTheList(input: {
  email: string;
  exam?: string;
  examDate?: string;
}): Promise<{ error?: string }> {
  /*
    Counted in the gate's attempts table under a separate key, so the
    form cannot be used to fill the list from one machine. Until
    phase42 has been run the table is missing and the count is skipped.
  */
  const visitor = await visitorKey(`waitlist:${requestIp(await headers())}`);
  const admin = createAdminClient();
  const { data: seen, error: seenError } = await admin
    .from("gate_attempts")
    .select("failures, first_failed_at")
    .eq("visitor", visitor)
    .maybeSingle();
  if (!seenError) {
    const fresh = !seen || Date.now() - Date.parse(seen.first_failed_at as string) > 3_600_000;
    const count = fresh ? 1 : Number(seen?.failures ?? 0) + 1;
    if (!fresh && count > WAITLIST_PER_HOUR) {
      return { error: "Too many sign-ups from here. Try again in an hour." };
    }
    await admin.from("gate_attempts").upsert({
      visitor,
      failures: count,
      first_failed_at: fresh ? new Date().toISOString() : (seen!.first_failed_at as string),
      locked_until: null,
    });
  }

  return joinWaitlist({
    email: input.email,
    exam: input.exam || null,
    examDate: input.examDate || null,
  });
}
