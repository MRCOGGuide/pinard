"use client";

import { useState, useTransition } from "react";
import { FIELD_CLASS, buttonClass } from "@/components/ui";
import { changePassword } from "./actions";

/**
 * Change the password from Account, with the current one (pre-launch
 * review, 18 November 2026). Folded until asked for, as Delete is.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
  }

  function save() {
    setError(null);
    if (next !== again) {
      setError("The two new passwords are not the same.");
      return;
    }
    startTransition(async () => {
      const result = await changePassword(current, next);
      if (result.error) setError(result.error);
      else {
        reset();
        setOpen(false);
        setDone(true);
      }
    });
  }

  const field = `mt-1 ${FIELD_CLASS}`;

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="font-ui text-[14px] font-semibold text-ink/70">Password</h2>
      {done && !open && <p className="mt-1 font-ui text-[16px] text-ink/80">Your password has been changed.</p>}
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setOpen(true);
          }}
          className={buttonClass("secondary", "md", "mt-4")}
        >
          Change my password
        </button>
      ) : (
        <div className="mt-3 max-w-sm">
          <label className="block text-sm text-ink/80">
            Current password
            <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
          </label>
          <label className="mt-3 block text-sm text-ink/80">
            New password (8 to 72 characters)
            <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} />
          </label>
          <label className="mt-3 block text-sm text-ink/80">
            New password again
            <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className={field} />
          </label>
          {error && <p className="mt-2 font-ui text-[15px] text-accent-ink">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !current || next.length < 8}
              className={buttonClass("primary", "md")}
            >
              {pending ? "Saving" : "Save new password"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
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
