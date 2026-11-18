/**
 * What a candidate is told when signing in or up fails, in Pinard's words
 * rather than the auth service's (pre-launch review, 18 November 2026):
 * its raw text could say whether an email address is registered, and was
 * written for developers. The code is read where the service gives one.
 */
type AuthError = { code?: string; message?: string; status?: number } | null | undefined;

const RATE = ["over_request_rate_limit", "over_email_send_rate_limit"];

export function signInMessage(error: AuthError): string {
  const code = error?.code ?? "";
  if (RATE.includes(code) || error?.status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (code === "email_not_confirmed")
    return "Confirm your email address first: the link is in the email we sent when you signed up.";
  if (code === "invalid_credentials" || /invalid login/i.test(error?.message ?? ""))
    return "That email address and password do not match. Check them, or reset your password.";
  return "Signing in did not work just now. Try again in a moment.";
}

export function signUpMessage(error: AuthError): string {
  const code = error?.code ?? "";
  if (RATE.includes(code) || error?.status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (code === "weak_password") return "Choose a stronger password: at least 8 characters, and not one that is widely used.";
  if (code === "validation_failed" || code === "email_address_invalid") return "Check the email address: it does not look complete.";
  // Never say whether the address already has an account.
  if (code === "user_already_exists" || code === "email_exists")
    return "That did not work. If you already have an account, sign in or reset your password.";
  return "Creating your account did not work just now. Try again in a moment.";
}
