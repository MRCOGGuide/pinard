"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/client";
import { FIELD_CLASS, buttonClass } from "@/components/ui";

/**
 * Ask for a link to choose a new password (pre-launch review, 18 November
 * 2026: a paid product with passwords had no way to reset one). The same
 * answer whether or not the address has an account, so this page cannot
 * be used to find out who is registered. The link lands on /auth/confirm.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [staleLink, setStaleLink] = useState(false);
  useEffect(() => {
    setStaleLink(new URLSearchParams(window.location.search).get("reason") === "link");
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error && (error.status === 429 || /rate/i.test(error.code ?? ""))) {
      setError("Too many requests. Wait a minute, then try again.");
      return;
    }
    // Any other answer reads the same, account or not.
    setSent(true);
  }

  return (
    <div className="mx-auto max-w-sm">
      <TraceHeader title="Reset your password" />

      {staleLink && !sent && (
        <p className="mb-4 rounded-card border border-accent/40 bg-surface p-3 text-sm text-ink/80">
          That link has expired or was already used. Ask for a new one below.
        </p>
      )}

      {sent ? (
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="reading text-ink/85">
            If an account uses <strong>{email.trim()}</strong>, we have sent it a link to choose a new password. The
            link works once, for one hour. Check your spam folder if it has not arrived in a few minutes.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/sign-in" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              Back to sign in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="mb-4 font-ui text-[15px] text-ink/75">
            Enter the email address you signed up with, and we will send you a link to choose a new password.
          </p>
          <label className="block font-ui text-[15px] font-semibold text-ink-strong">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1.5 ${FIELD_CLASS}`}
            />
          </label>
          {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
          <button type="submit" disabled={busy} className={buttonClass("primary", "md", "mt-5 w-full")}>
            {busy ? "Sending…" : "Send me a link"}
          </button>
          <p className="mt-4 text-center text-sm text-ink/70">
            Remembered it?{" "}
            <Link href="/sign-in" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
