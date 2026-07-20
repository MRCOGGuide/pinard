/**
 * Extracts the Supabase session id from an access-token JWT. Supabase
 * mints a fresh session_id on every sign-in, so it uniquely identifies a
 * login. Works in both the Edge (middleware) and Node runtimes via atob.
 */
export function sessionIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded)) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}
