"use client";

import { useState, useTransition } from "react";
import { reportQuestion } from "@/app/session/actions";
import { REPORT_NOTE_LIMIT, REPORT_REASONS } from "@/lib/questionReportReasons";
import { FIELD_CLASS } from "@/components/ui";

/**
 * "Report a problem" under an answered question.
 *
 * Flagging a question only bookmarks it for the candidate; nothing
 * reached the owner unless Ask Pinard happened to agree with a
 * challenge. This sends a reason and a note, tied to the question, to
 * the Reports screen. Shut until asked for, so it costs an answered card
 * one quiet line.
 */
export function ReportQuestion({ questionId }: { questionId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <p className="mt-3 text-label text-good" role="status">
        Thank you: reported. We will check it against its source.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-label text-ink/55 underline-offset-2 hover:text-ink-strong hover:underline"
      >
        Report a problem with this question
      </button>
    );
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await reportQuestion({ questionId, reason, note });
      if (result.error) setError(result.error);
      else setSent(true);
    });
  }

  return (
    <div className="mt-3 rounded-card border border-line bg-raised p-3">
      <p className="text-sm font-medium text-ink-strong">What is wrong with this question?</p>
      <div className="mt-2 space-y-1">
        {REPORT_REASONS.map((r) => (
          <label key={r.key} className="flex items-center gap-2 text-sm text-ink/85">
            <input
              type="radio"
              name={`report-${questionId}`}
              value={r.key}
              checked={reason === r.key}
              onChange={() => setReason(r.key)}
            />
            {r.label}
          </label>
        ))}
      </div>
      <textarea
        rows={3}
        maxLength={REPORT_NOTE_LIMIT}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Details help: which option, which guideline, what it should say."
        className={`mt-2 ${FIELD_CLASS}`}
      />
      {error && <p className="mt-2 font-ui text-[15px] text-accent-ink">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={!reason || pending}
          className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-40"
        >
          {pending ? "Sending" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-card px-3 py-2 text-sm text-ink/60 hover:text-ink-strong"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
