/**
 * The pre-launch gate's cookie and its attempt limit, shared by the
 * middleware (which checks the cookie on every page) and /api/gate
 * (which issues it).
 *
 * Security audit findings H4 and M1 (docs/security/REPORT.md). The
 * cookie used to be btoa(code): the access code itself, encoded, so
 * anyone who saw the cookie learned the code. It is now an HMAC of the
 * code under a server-only key, which proves the visitor typed it
 * without revealing it, and it is compared in constant time.
 *
 * Web Crypto only, so the same code runs in the Edge middleware and in
 * the Node route handler.
 */

export const GATE_COOKIE = "pinard_gate";

/** Ten failures in fifteen minutes locks a visitor out for fifteen. */
export const GATE_MAX_FAILURES = 10;
export const GATE_WINDOW_MS = 15 * 60_000;
export const GATE_LOCK_MS = 15 * 60_000;

/**
 * The key everything here is signed with. GATE_COOKIE_SECRET when it is
 * set; otherwise the service-role key, which is already a server-only
 * secret and is never revealed by an HMAC made with it. Changing either
 * signs everyone out of the gate once, which is harmless.
 */
function signingKey(): string {
  return process.env.GATE_COOKIE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value for a given access code. */
export function gateToken(code: string): Promise<string> {
  return hmacHex(`pinard-gate:${code}`);
}

/** The visitor, as stored against failed attempts: a keyed hash of the
 *  IP address rather than the address itself. */
export function visitorKey(ip: string): Promise<string> {
  return hmacHex(`pinard-visitor:${ip}`);
}

/** Equal strings, compared without leaking where they first differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** The address the request came from, as Vercel reports it. */
export function requestIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
