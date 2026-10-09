import { signText, verifyText } from "@/lib/signing";

/**
 * One-click unsubscribe from reminder emails (Phase 11).
 *
 * The link carries the account id and a server signature of it, so it
 * works from any inbox without signing in, and nobody can turn off
 * someone else's reminders by guessing an id. The same address serves
 * the List-Unsubscribe header (RFC 8058), which mail apps use for their
 * own Unsubscribe button.
 */
const PURPOSE = "unsubscribe-reminders";

export async function unsubscribeUrl(site: string, userId: string): Promise<string> {
  const s = await signText(PURPOSE, userId);
  return `${site}/unsubscribe?u=${encodeURIComponent(userId)}&s=${s}`;
}

export async function unsubscribeApiUrl(site: string, userId: string): Promise<string> {
  const s = await signText(PURPOSE, userId);
  return `${site}/api/unsubscribe?u=${encodeURIComponent(userId)}&s=${s}`;
}

export async function validUnsubscribe(userId: unknown, signature: unknown): Promise<boolean> {
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  return verifyText(PURPOSE, userId, signature);
}
