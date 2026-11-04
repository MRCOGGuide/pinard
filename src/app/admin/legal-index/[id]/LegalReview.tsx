"use client";

import { useState, useTransition } from "react";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import { reviewLegalEntry } from "../actions";

export type LegalStatus = "draft" | "approved" | "needs_changes" | "rejected";

const STATUS_LABEL: Record<LegalStatus, string> = {
  draft: "Waiting for review",
  approved: "Approved: Ask Pinard uses it",
  needs_changes: "Needs changes",
  rejected: "Not needed",
};

export function LegalReview(props: { id: number; status: LegalStatus; establishes: string; note: string }) {
  const [status, setStatus] = useState(props.status);
  const [establishes, setEstablishes] = useState(props.establishes);
  const [note, setNote] = useState(props.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: LegalStatus) {
    start(async () => {
      const result = await reviewLegalEntry({ id: props.id, status: next, establishes, note });
      if (result.error) return setError(result.error);
      setStatus(next);
      setError(null);
    });
  }

  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <p className="font-ui text-[15px] font-semibold text-ink-strong">{STATUS_LABEL[status]}</p>
      <label className="mt-3 block font-ui text-[14px] text-ink/70">
        Correct this directly if it is wrong
        <textarea rows={6} value={establishes} onChange={(e) => setEstablishes(e.target.value)} className={`${FIELD_CLASS} mt-1 w-full`} />
      </label>
      <label className="mt-3 block font-ui text-[14px] text-ink/70">
        A note, if something needs more than that
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD_CLASS} mt-1 w-full`} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => save("approved")} className={buttonClass("primary", "sm")}>
          Approve
        </button>
        <button type="button" disabled={pending} onClick={() => save("needs_changes")} className={buttonClass("secondary", "sm")}>
          Needs changes
        </button>
        <button type="button" disabled={pending} onClick={() => save("rejected")} className={buttonClass("secondary", "sm")}>
          Not needed
        </button>
        {status !== "draft" && (
          <button type="button" disabled={pending} onClick={() => save("draft")} className="font-ui text-[13px] text-ink/60 underline underline-offset-2">
            Undo
          </button>
        )}
        {error && <span className="font-ui text-[14px] text-accent-ink">{error}</span>}
      </div>
    </section>
  );
}
