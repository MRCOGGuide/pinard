/**
 * A path inside this site, and not the sign-in or sign-up pages: the
 * only kind of place a ?next= may send someone. Anything else, a full
 * URL or a protocol-relative //host, would let a link to sign-in carry
 * a visitor off to somewhere else after they type their password.
 *
 * Browsers drop tabs and line breaks from a URL and read a backslash as
 * a slash, so "/<tab>/host" or "/\host" becomes "//host", another site
 * (pre-launch review, 18 November 2026). Any of those characters, or any
 * whitespace, refuses the path outright; and what is left must still
 * resolve to this site when read as a URL.
 */
const SELF = "https://pinard.invalid";

export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  // Control characters, whitespace and backslashes: never in a path of ours.
  if (/[\u0000-\u001f\u007f\s\\]/.test(next)) return null;
  try {
    if (new URL(next, SELF).origin !== SELF) return null;
  } catch {
    return null;
  }
  if (next.startsWith("/sign-in") || next.startsWith("/sign-up")) return null;
  return next;
}
