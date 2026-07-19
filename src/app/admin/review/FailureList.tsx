"use client";

import { useTransition } from "react";
import type { FailureRow } from "./page";
import { resolveFailure } from "./actions";

export function FailureList({ failures }: { failures: FailureRow[] }) {
  if (failures.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-display text-xl font-semibold text-theatre">
        Flagged verification failures
      </h2>
      <p className="mb-3 text-sm text-graphite/60">
        Questions the generator could not verify against its sources after
        retrying. Nothing here reached the review queue.
      </p>
      <ul className="space-y-2">
        {failures.map((f) => (
          <FailureItem key={f.id} failure={f} />
        ))}
      </ul>
    </section>
  );
}

function FailureItem({ failure }: { failure: FailureRow }) {
  const [pending, startTransition] = useTransition();

  return (
    <li className="rounded-card border border-heartbeat/30 bg-porcelain p-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-graphite/60">
            {failure.sections?.title ?? "Unassigned"}
            {failure.format ? ` · ${failure.format.toUpperCase()}` : ""} ·{" "}
            {new Date(failure.created_at).toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="mt-1 text-sm text-graphite/85">{failure.reason}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => resolveFailure(failure.id).then(() => {}))}
          className="rounded px-2 py-1 text-xs font-medium text-graphite/60 hover:text-theatre disabled:opacity-40"
        >
          Dismiss
        </button>
      </div>
    </li>
  );
}
