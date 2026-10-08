"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/client";
import { claimActiveSession } from "@/app/sign-in/actions";
import { claimInvite, verifyInvite } from "./actions";
import { WaitlistForm } from "./WaitlistForm";
import { FIELD_CLASS, buttonClass } from "@/components/ui";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  /*
    Before launch the door is shut to everyone, which is also shut to
    the ten colleagues the pilot depends on. A code opens it for them
    without opening it to the internet.
  */
  const launched = process.env.NEXT_PUBLIC_LAUNCHED === "true";
  const [invite, setInvite] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    // Checked before the account is made, spent after it exists.
    if (!launched) {
      const seen = await verifyInvite(invite);
      if (!seen.ok) {
        setError(seen.reason ?? "That code is not one of ours.");
        setBusy(false);
        return;
      }
    }

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
      if (!launched) await claimInvite(invite);
      await claimActiveSession();
      router.push("/");
      router.refresh();
      return;
    }

    // Email confirmation is on — the account exists but needs verifying.
    setAwaitingConfirm(true);
    setBusy(false);
  }

  const field = `mt-1.5 ${FIELD_CLASS}`;


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
      <TraceHeader
        title={launched ? "Create your account" : "Invited?"}
        lede={
          launched
            ? undefined
            : "Pinard is open to a small pilot before it opens to everyone. If someone gave you a code, this is where it goes."
        }
      />

      <form
        onSubmit={handleSubmit}
        className="rounded-card border border-line bg-surface p-6 shadow-card"
      >
        <label className="block font-ui text-[15px] font-semibold text-ink-strong">
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

        <label className="mt-4 block font-ui text-[15px] font-semibold text-ink-strong">
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

        {!launched && (
          <label className="mt-4 block font-ui text-[15px] font-semibold text-ink-strong">
            Invite code
            <input
              type="text"
              required
              autoCapitalize="characters"
              spellCheck={false}
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="ABCD2345"
              className={`${field} font-mono uppercase tracking-widest`}
            />
          </label>
        )}

        <label className="mt-4 block font-ui text-[15px] font-semibold text-ink-strong">
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

        {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className={buttonClass("primary", "md", "mt-5 w-full")}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-3 text-center text-xs text-ink/65">
          By creating an account you agree to our{" "}
          <Link href="/terms" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            Privacy Policy
          </Link>
          .
        </p>

        <p className="mt-4 text-center text-sm text-ink/70">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
            Sign in
          </Link>
        </p>
      </form>

      {!launched && <WaitlistForm />}
    </div>
  );
}
