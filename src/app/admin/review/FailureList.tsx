"use client";

import { useMemo, useState, useTransition } from "react";
import type { FailureRow } from "./page";
import { groupFailures, type FailureGroup, type FailureKind } from "@/lib/failures";
import { formatWhen } from "@/lib/when";
import { resolveFailure } from "./actions";

/**
 * What has gone wrong, said once per fault rather than once per
 * occurrence.
 *
 * This list used to be fifty rows under the heading "Questions the
 * generator could not verify against its sources", which was true of
 * about one row in a hundred. When Ask Pinard began timing out, both
 * attempts were logged and neither was findable: 390 copies of "this
 * organization has been disabled" sat between the owner and them.
 *
 * Service faults come first because a candidate is hitting them now,
 * and no amount of reviewing questions will help.
 */

const SECTION: Record<FailureKind, { title: string; lede: string }> = {
  service: {
    title: "Service faults",
    lede: "Something outside the questions is failing. Candidates meet these as an apology, and reviewing questions will not clear them.",
  },
  verification: {
    title: "Flagged verification failures",
    lede: "Questions the generator could not verify against its sources after retrying. Nothing here reached the review queue.",
  },
  other: {
    title: "Unclassified",
    lede: "Logged, but not of a kind this screen recognises yet.",
  },
};

export function FailureList({ failures }: { failures: FailureRow[] }) {
  const groups = useMemo(() => groupFailures(failures), [failures]);
  if (groups.length === 0) return null;

  const kinds: FailureKind[] = ["service", "verification", "other"];

  return (
    <>
      {kinds.map((kind) => {
        const inKind = groups.filter((g) => g.kind === kind);
        if (inKind.length === 0) return null;
        return (
          <section key={kind} className="mt-10">
            <h2 className="mb-1 font-display text-xl font-semibold text-ink-strong">
              {SECTION[kind].title}
            </h2>
            <p className="mb-3 text-sm text-ink/60">{SECTION[kind].lede}</p>
            <ul className="space-y-2">
              {inKind.map((group) => (
                <FailureItem key={group.signature} group={group} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function FailureItem({ group }: { group: FailureGroup }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const service = group.kind === "service";

  return (
    <li
      className={`rounded-card border p-3 shadow-card ${
        service
          ? "border-accent/40 bg-accent/5"
          : "border-accent/30 bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-ink/60">
            {group.sections.length > 0 && <>{group.sections.join(", ")} · </>}
            {/* The count is the point: one fault, however many times. */}
            {group.count === 1
              ? "once"
              : `${group.count} times`}{" "}
            · most recent {formatWhen(group.latest)}
          </p>
          <p className="mt-0.5 break-words text-sm text-ink/85">
            {group.headline}
          </p>
          {group.headline !== group.signature && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-1 font-mono text-[11px] text-ink/50 underline underline-offset-2 hover:text-ink-strong"
            >
              {open ? "Hide detail" : "Show detail"}
            </button>
          )}
          {open && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-card border border-line bg-raised/70 p-2 font-mono text-[11px] text-ink/70">
              {group.signature}
            </pre>
          )}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => {
              void resolveFailure(group.ids);
            })
          }
          className="shrink-0 rounded-card border border-line px-2.5 py-1 text-xs font-medium text-ink/70 hover:border-good hover:text-ink-strong disabled:opacity-50"
        >
          {pending
            ? "Clearing…"
            : group.count === 1
              ? "Resolve"
              : `Resolve all ${group.count}`}
        </button>
      </div>
    </li>
  );
}
