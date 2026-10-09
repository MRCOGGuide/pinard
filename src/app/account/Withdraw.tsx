"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { withdrawFromContract } from "./actions";

export type WithdrawOption = {
  id: string;
  label: string;
  price: string;
  bought: string;
  until: string;
};

/**
 * The withdrawal button the EU requires for the 14-day withdrawal
 * period (lib/withdrawal). Labelled in the words the directive uses,
 * then a confirmation step naming the contract, the account and the
 * refund, so nobody withdraws by accident and nobody has to hunt for it.
 */
export function Withdraw({ options, email, name }: { options: WithdrawOption[]; email: string; name: string }) {
  const [chosen, setChosen] = useState<WithdrawOption | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!chosen) return;
    setError(null);
    startTransition(async () => {
      const result = await withdrawFromContract(chosen.id);
      if (result.error) setError(result.error);
      else {
        setDone(
          `Done. You have withdrawn from your ${chosen.label.toLowerCase()} and ${result.refunded} is on its way back to your card. We have emailed you a confirmation.`
        );
        setChosen(null);
      }
    });
  }

  if (done) {
    return (
      <div className="mt-4 rounded-card border border-good/40 bg-good/5 p-6 font-ui text-[16px] text-ink/85" role="status">
        {done}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="font-ui text-[14px] font-semibold text-ink/70">Your 14 days to withdraw</h2>
      <p className="mt-1 font-ui text-[16px] leading-relaxed text-ink/80">
        You can withdraw from a recent purchase for a full refund. See our{" "}
        <Link href="/refunds" className="font-medium text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
          refunds and withdrawal policy
        </Link>
        .
      </p>

      {!chosen ? (
        <ul className="mt-4 space-y-3">
          {options.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="font-ui text-[15px] text-ink/85">
                {o.label}, {o.price}, bought {o.bought}. Available until {o.until}.
              </span>
              <button
                type="button"
                onClick={() => setChosen(o)}
                className="btn-motion inline-flex h-11 items-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
              >
                Withdraw from contract here
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-control border border-line bg-sunk p-4 font-ui text-[15px] text-ink/85">
          <p className="font-semibold text-ink-strong">Confirm your withdrawal</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
            <dt className="text-ink/65">Name</dt>
            <dd>{name || "Not given"}</dd>
            <dt className="text-ink/65">Account</dt>
            <dd>{email}</dd>
            <dt className="text-ink/65">Contract</dt>
            <dd>
              {chosen.label}, bought {chosen.bought}
            </dd>
            <dt className="text-ink/65">Refund</dt>
            <dd>{chosen.price}, in full, to your original payment method</dd>
          </dl>
          <p className="mt-3">
            {chosen.id.startsWith("sub:")
              ? "Your plan ends straight away and you lose access to the paid features."
              : "The top-up questions are removed from your account."}{" "}
            We will email a confirmation to {email}.
          </p>
          {error && <p className="mt-2 text-accent-ink">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="btn-motion inline-flex h-11 items-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-40"
            >
              {pending ? "Withdrawing…" : "Confirm withdrawal"}
            </button>
            <button
              type="button"
              onClick={() => setChosen(null)}
              disabled={pending}
              className="inline-flex h-11 items-center px-3 font-ui text-[15px] font-semibold text-ink/70 hover:text-ink-strong"
            >
              Keep my purchase
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
