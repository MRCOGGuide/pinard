"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { approveAllLegalEntries } from "./actions";

/**
 * The index runs to hundreds of entries, most of them read in a moment.
 * An entry only brings passages into an answer, and every line of the
 * answer is still checked against those passages, so the owner may
 * correct the ones that matter and approve the rest at once.
 */
export function ApproveAll({ count }: { count: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function approve() {
    if (!window.confirm(`Approve all ${count} entries waiting for review? Ask Pinard will use them. Any of them can be changed later.`)) return;
    start(async () => {
      const result = await approveAllLegalEntries();
      setError(result.error ?? null);
    });
  }

  return (
    <p className="mb-6 flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={approve} className={buttonClass("secondary", "sm")}>
        {pending ? "Approving…" : `Approve all ${count} waiting`}
      </button>
      {error && <span className="font-ui text-[14px] text-accent-ink">{error}</span>}
    </p>
  );
}
