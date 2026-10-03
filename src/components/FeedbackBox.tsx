"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Button, FIELD_CLASS, Toast } from "@/components/ui";
import { sendFeedback } from "@/app/actions";

/**
 * A line to the owner, from wherever someone is standing.
 *
 * The pilot's whole value is the sentence nobody thought to ask about,
 * and a candidate will not leave the product, find an email address
 * and compose a message to deliver it. So it sits in the footer of
 * every page, closed, and takes the path with it: "this one is wrong"
 * is worth little without knowing which one.
 *
 * Signed in only, because an open box on a public page is a spam
 * target, and because the useful feedback comes from people using the
 * thing.
 */
export function FeedbackBox() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-ink/60 hover:text-ink-strong"
      >
        Tell me something
      </button>
    );
  }

  return (
    <div className="mx-auto mt-3 max-w-md rounded-card border border-line bg-raised p-4 text-left">
      {done ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-ink/85">Got it. Thank you.</p>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => {
              setOpen(false);
              setDone(false);
              setMessage("");
            }}
          >
            Close
          </Button>
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium text-ink/85">
            What is wrong, or missing, or good?
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="A question that reads oddly, a screen that confused you, anything."
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </label>
          <p className="mt-1 font-mono text-micro text-ink/45">
            Sent with the page you are on: {path}
          </p>
          {error && (
            <Toast tone="bad" className="mt-2">
              {error}
            </Toast>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={pending || message.trim().length < 3}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await sendFeedback({ message, path });
                  if (result.error) setError(result.error);
                  else setDone(true);
                })
              }
            >
              {pending ? "Sending…" : "Send"}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
