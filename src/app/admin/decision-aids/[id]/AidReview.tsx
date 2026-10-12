"use client";

import { useState, useTransition } from "react";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import type { AidStatus } from "@/lib/decision-aid-shape";
import { reviewAid } from "../actions";

const STATUS_LABEL: Record<AidStatus, string> = {
  draft: "Waiting for review",
  approved: "Approved: Ask Pinard follows it",
  needs_changes: "Needs changes",
  rejected: "Not a decision aid",
};

export function AidReview(props: { id: number; status: AidStatus; note: string }) {
  const [status, setStatus] = useState(props.status);
  const [note, setNote] = useState(props.note);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(next: AidStatus) {
    start(async () => {
      const result = await reviewAid({ id: props.id, status: next, note });
      if (result.error) return setError(result.error);
      setStatus(next);
      setError(null);
    });
  }

  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-4">
      <p className="font-ui text-[15px] font-semibold text-ink-strong">{STATUS_LABEL[status]}</p>
      <label className="mt-3 block font-ui text-[14px] text-ink/70">
        What is wrong, if anything (e.g. &ldquo;Hospital admission belongs under intermediate risk&rdquo;)
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD_CLASS} mt-1 w-full`} />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => save("approved")} className={buttonClass("primary", "sm")}>
          Approve
        </button>
        <button type="button" disabled={pending} onClick={() => save("needs_changes")} className={buttonClass("secondary", "sm")}>
          Needs changes
        </button>
        <button type="button" disabled={pending} onClick={() => save("rejected")} className={buttonClass("secondary", "sm")}>
          Not a decision aid
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
