"use server";

import { cookies } from "next/headers";
import { CONSENT_COOKIE, CONSENT_MAX_AGE, type ConsentChoice } from "@/lib/consent";
import { SIGNAL_COOKIE } from "@/lib/region";

/**
 * Records the visitor's cookie choice. Rejecting also removes the one
 * optional cookie if an earlier "Accept" had set it: it is HttpOnly, so
 * only the server can.
 */
export async function setCookieConsent(choice: ConsentChoice): Promise<void> {
  if (choice !== "all" && choice !== "essential") return;
  const jar = await cookies();
  jar.set(CONSENT_COOKIE, choice, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONSENT_MAX_AGE,
  });
  if (choice === "essential") jar.delete(SIGNAL_COOKIE);
}
