"use client";

import { useState, useTransition } from "react";
import { setGapStatus } from "./actions";

const action = "font-ui text-[14px] font-medium text-good hover:text-ink-strong disabled:opacity-40";

/** Marks a gap dealt with, or puts it back. */
export function GapControls({ ids, open }: { ids: number[]; open: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(status: "open" | "added" | "not_a_gap") {
    start(async () => {
      const result = await setGapStatus(ids, status);
      setError(result.error ?? null);
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {open ? (
        <>
          <button type="button" disabled={pending} onClick={() => save("added")} className={action}>
            Added to the library
          </button>
          <button type="button" disabled={pending} onClick={() => save("not_a_gap")} className={action}>
            Not a gap
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => save("open")} className={action}>
          Put back
        </button>
      )}
      {error && <span className="font-ui text-[14px] text-accent-ink">{error}</span>}
    </span>
  );
}
