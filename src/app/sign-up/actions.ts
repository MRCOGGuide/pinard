"use server";

import { createClient } from "@/lib/supabase/server";
import {
  checkInviteCode,
  joinWaitlist,
  redeemInviteCode,
} from "@/lib/pilot";

/**
 * Whether an invite code would admit someone, asked before the account
 * is created.
 *
 * The check and the spend are separate on purpose: a code that admitted
 * somebody whose sign-up then failed on a weak password has not been
 * used, and a pilot of ten places should not lose one to a typo.
 */
export async function verifyInvite(
  code: string
): Promise<{ ok: boolean; reason?: string }> {
  const result = await checkInviteCode(code);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Spend the place, now that the account exists.
 *
 * Takes the code from the client, which is why it checks it again
 * rather than trusting that verifyInvite was called: a signed-in user
 * posting any string here would otherwise mark an arbitrary code as
 * used.
 */
export async function claimInvite(code: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const result = await checkInviteCode(code);
  if (!result.ok || !result.code) return;
  await redeemInviteCode(result.code, user.id);
}

/** Tell me when it opens, and for which diet. */
export async function joinTheList(input: {
  email: string;
  exam?: string;
  examDate?: string;
}): Promise<{ error?: string }> {
  return joinWaitlist({
    email: input.email,
    exam: input.exam || null,
    examDate: input.examDate || null,
  });
}
