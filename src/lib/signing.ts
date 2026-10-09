/**
 * Short server-side signatures for text that makes a round trip through
 * the browser and must come back unaltered.
 *
 * Used for Ask Pinard's answers on Today (security audit L1): the
 * conversation's history travels with each new question so "and in
 * twins?" knows what it follows, and without a signature a candidate
 * could send back an "answer" Pinard never gave and steer the model
 * with it. Answers are signed when given; on the way back, an assistant
 * turn whose signature does not check is dropped.
 *
 * The key is the gate's signing key (GATE_COOKIE_SECRET, or the
 * service-role key): server-only, never sent anywhere.
 */
import { constantTimeEqual } from "@/lib/gate";

function signingKey(): string {
  return process.env.GATE_COOKIE_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export async function signText(purpose: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${purpose}:${text}`));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyText(purpose: string, text: string, signature: unknown): Promise<boolean> {
  if (typeof signature !== "string" || signature.length !== 64) return false;
  return constantTimeEqual(signature, await signText(purpose, text));
}
