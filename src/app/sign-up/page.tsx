"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/client";
import { claimActiveSession } from "@/app/sign-in/actions";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      await claimActiveSession();
      router.push("/");
      router.refresh();
      return;
    }

    // Email confirmation is on — the account exists but needs verifying.
    setAwaitingConfirm(true);
    setBusy(false);
  }

  const field =
    "mt-1 w-full rounded-card border border-line bg-raised px-3 py-2 text-sm";

  // Public sign-ups are closed until launch.
  if (process.env.NEXT_PUBLIC_LAUNCHED !== "true") {
    return (
      <div className="mx-auto max-w-sm">
        <TraceHeader title="Coming soon" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed text-ink/80">
            Pinard is in development and not yet open for sign-ups. We&rsquo;re
            putting the finishing touches to it — check back soon.
          </p>
          <Link
            href="/about"
            className="mt-5 inline-block rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Learn how Pinard works
          </Link>
        </div>
      </div>
    );
  }

  if (awaitingConfirm) {
    return (
      <div className="mx-auto max-w-sm">
        <TraceHeader title="Check your email" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed">
            We&rsquo;ve sent a confirmation link to{" "}
            <span className="font-medium">{email}</span>. Click it, then come
            back and sign in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm">
      <TraceHeader title="Create your account" />

      <form
        onSubmit={handleSubmit}
        className="rounded-card border border-line bg-surface p-6 shadow-card"
      >
        <label className="block text-sm font-medium">
          Name
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={field}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>

        {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-card bg-brand px-4 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-60"
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-3 text-center text-xs text-ink/55">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="text-good">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-good">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="mt-4 text-center text-sm text-ink/70">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-good">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
