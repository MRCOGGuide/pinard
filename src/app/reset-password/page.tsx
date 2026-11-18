"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/client";
import { FIELD_CLASS, buttonClass } from "@/components/ui";

/**
 * Choose a new password, after following the emailed link (which signed
 * this device in through /auth/confirm). Without that sign-in the page
 * says the link has expired and offers a new one.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setReady(Boolean(data.user)));
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8 || password.length > 72) {
      setError("Choose a password of 8 to 72 characters.");
      return;
    }
    if (password !== again) {
      setError("The two passwords are not the same.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(
        error.code === "same_password"
          ? "Choose a password different from your old one."
          : error.code === "weak_password"
            ? "Choose a stronger password: at least 8 characters, and not one that is widely used."
            : "Your password could not be changed just now. Try again in a moment."
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  const field = `mt-1.5 ${FIELD_CLASS}`;

  return (
    <div className="mx-auto max-w-sm">
      <TraceHeader title="Choose a new password" />

      {ready === false ? (
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="reading text-ink/85">This link has expired or was already used.</p>
          <p className="mt-4 text-sm">
            <Link href="/forgot-password" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
              Ask for a new link
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="rounded-card border border-line bg-surface p-6 shadow-card">
          <label className="block font-ui text-[15px] font-semibold text-ink-strong">
            New password
            <input
              type="password"
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
          <label className="mt-4 block font-ui text-[15px] font-semibold text-ink-strong">
            The same again
            <input
              type="password"
              required
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              className={field}
            />
          </label>
          {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
          <button type="submit" disabled={busy || ready !== true} className={buttonClass("primary", "md", "mt-5 w-full")}>
            {busy ? "Saving…" : "Save my new password"}
          </button>
        </form>
      )}
    </div>
  );
}
