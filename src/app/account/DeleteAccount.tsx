"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FIELD_CLASS } from "@/components/ui";
import { deleteMyAccount } from "./actions";

/**
 * Delete the account, behind the candidate's own email address typed
 * out: a deliberate act rather than one click, and nothing an
 * accidental tap on a phone can do. What happens to the subscription
 * and to a refund is said before, not after.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMyAccount(typed);
      if (result.error) setError(result.error);
      else window.location.href = "/";
    });
  }

  return (
    <div className="mt-10 rounded-card border border-accent/30 bg-accent/[0.03] p-6">
      <h2 className="font-display text-[21px] font-semibold leading-snug text-accent-ink">Delete your account</h2>
      <p className="mt-1 font-ui text-[16px] leading-relaxed text-ink/80">
        This permanently deletes your account, your plan, your answers and your progress, and cannot be undone. Any
        subscription is cancelled immediately and is not refunded automatically: if you want a refund under our{" "}
        <Link href="/refunds" className="underline">
          refund policy
        </Link>
        , ask for it before you delete.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-motion mt-4 inline-flex h-11 items-center rounded-control border border-accent/40 bg-surface px-5 font-ui text-[15px] font-semibold text-accent-ink hover:bg-accent/10"
        >
          Delete my account
        </button>
      ) : (
        <div className="mt-4">
          <label className="block text-sm text-ink/80">
            Type <strong>{email}</strong> to confirm
            <input
              type="email"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </label>
          {error && <p className="mt-2 font-ui text-[15px] text-accent-ink">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
              className="rounded-card border border-accent/40 bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent/15 disabled:opacity-40"
            >
              {pending ? "Deleting" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
              className="rounded-card px-3 py-2.5 text-sm text-ink/65 hover:text-ink-strong"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
