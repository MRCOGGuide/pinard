"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/client";
import { claimActiveSession } from "./actions";

export default function SignInPage() {
  const router = useRouter();
  const [signedOutElsewhere, setSignedOutElsewhere] = useState(false);
  useEffect(() => {
    setSignedOutElsewhere(
      new URLSearchParams(window.location.search).get("reason") === "elsewhere"
    );
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // Claim this login as the account's single active session.
    await claimActiveSession();

    router.push("/");
    router.refresh();
  }

  const field =
    "mt-1 w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-sm">
      <TraceHeader title="Sign in" />

      {signedOutElsewhere && (
        <p className="mb-4 rounded-card border border-heartbeat/40 bg-porcelain p-3 text-sm text-graphite/80">
          You were signed out because your account was used on another device.
          Only one device can be signed in at a time.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-card border border-hairline bg-porcelain p-6 shadow-card"
      >
        <label className="block text-sm font-medium">
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={field}
          />
        </label>

        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-card bg-theatre px-4 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-graphite/70">
          New here?{" "}
          <Link href="/sign-up" className="font-medium text-greentop">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
