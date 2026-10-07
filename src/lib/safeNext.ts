/**
 * A path inside this site, and not the sign-in or sign-up pages: the
 * only kind of place a ?next= may send someone. Anything else, a full
 * URL or a protocol-relative //host, would let a link to sign-in carry
 * a visitor off to somewhere else after they type their password.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/sign-in") || next.startsWith("/sign-up")) return null;
  return next;
}
