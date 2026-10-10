"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, CONSENT_EVENT, type ConsentChoice } from "@/lib/consent";
import { setCookieConsent } from "@/app/consent-actions";

/**
 * The cookie banner: Accept or Reject, the same size and weight, so
 * neither is the easy way out (owner's decision, 10 October 2026; no
 * dark patterns). Nothing optional is set before a choice, and Reject
 * leaves every part of Pinard working (lib/consent).
 *
 * Shown until a choice is made, and again from "Cookie settings" in the
 * footer. Rendered after the page has loaded, so it never appears in
 * the server's HTML for a visitor who has already chosen.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const chosen = document.cookie.split("; ").some((c) => c.startsWith(`${CONSENT_COOKIE}=`));
    if (!chosen) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_EVENT, reopen);
  }, []);

  async function choose(choice: ConsentChoice) {
    setBusy(true);
    await setCookieConsent(choice);
    setBusy(false);
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div
      role="region"
      aria-label="Cookie choice"
      className="pop-in fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md sm:px-0 sm:pb-0"
    >
      <div className="rounded-card border border-line/70 bg-surface/85 p-5 shadow-raised backdrop-blur-xl backdrop-saturate-150">
        <p className="font-ui text-[16px] font-semibold text-ink-strong">Cookies on Pinard</p>
        <p className="mt-1.5 font-ui text-[15px] leading-relaxed text-ink/80">
          We use cookies that are needed to sign you in and keep Pinard secure. With your OK we also remember the
          pricing page&rsquo;s price check, so it does not run again on each visit. No analytics, advertising or
          tracking. See our{" "}
          <Link href="/cookies" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            Cookie Policy
          </Link>
          .
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose("essential")}
            className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-4 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70 disabled:opacity-60"
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void choose("all")}
            className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-4 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70 disabled:opacity-60"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Cookie settings" in the footer: opens the banner again. */
export function CookieSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}
