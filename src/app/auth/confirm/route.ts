import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordActiveSession } from "@/lib/activeSession";
import { safeNext } from "@/lib/safeNext";

/**
 * Where the links in Pinard's emails land: confirm a new account, or
 * reset a forgotten password (pre-launch review, 18 November 2026: there
 * was no way to reset one, and public sign-up had no confirmation route).
 *
 * The emails carry a one-time token rather than a code tied to the
 * browser that asked, so a link opened on a phone works for an account
 * created on a laptop. The email templates in Supabase build the link:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 *
 * A good token signs the candidate in on this device, makes it the
 * account's one active device, and goes on to `next` (a page of this site
 * only). An old or used link goes back with a note to ask for a new one.
 */
const TYPES: EmailOtpType[] = ["email", "signup", "recovery", "invite", "email_change"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next")) ?? "/";

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user && data.session) {
      await recordActiveSession(data.user.id, data.session.access_token);
      redirect(next);
    }
  }
  redirect(type === "recovery" ? "/forgot-password?reason=link" : "/sign-in?reason=link");
}
