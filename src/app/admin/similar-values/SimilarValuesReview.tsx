"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { ValueGroup } from "@/lib/similarValues";
import { markGroupReviewed, setFactsExcluded } from "./actions";

/**
 * Review runs on selection, not one row at a time: a value group is
 * read as a whole and usually has several facts to drop together, so
 * ticking them and declining once matches how the judgement is actually
 * made. Selection is scoped to the page and cleared after each action.
 */
export function SimilarValuesReview({
  groups,
  show,
  page,
  pageCount,
  totalInFilter,
}: {
  groups: ValueGroup[];
  show: "unreviewed" | "reviewed";
  page: number;
  pageCount: number;
  totalInFilter: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  // What the action bar offers depends on what is ticked: a selection of
  // live facts declines, one of declined facts restores, a mix offers
  // both rather than guessing which was meant.
  const excludedById = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const g of groups) for (const f of g.facts) m.set(f.id, f.excluded);
    return m;
  }, [groups]);

  const liveSelected = selectedIds.filter(
    (id) => excludedById.get(id) === false
  );
  const declinedSelected = selectedIds.filter(
    (id) => excludedById.get(id) === true
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setMany(ids: number[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function act(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error ?? null);
      if (!result.error) setSelected(new Set());
    });
  }

  const allOnPage = groups.flatMap((g) => g.facts.map((f) => f.id));
  const allTicked =
    allOnPage.length > 0 && allOnPage.every((id) => selected.has(id));

  const tab = (value: "unreviewed" | "reviewed", label: string) => (
    <Link
      href={`/admin/similar-values?show=${value}`}
      className={`rounded-card border px-2.5 py-1 text-xs font-medium ${
        show === value
          ? "border-theatre bg-theatre text-porcelain"
          : "border-hairline bg-porcelain text-graphite/70 hover:text-theatre"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className={selectedIds.length > 0 ? "pb-24" : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {tab("unreviewed", "To review")}
        {tab("reviewed", "Reviewed")}
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => setMany(allOnPage, !allTicked)}
            className="ml-2 rounded-card border border-hairline px-2.5 py-1 text-xs font-medium text-graphite/70 hover:border-greentop hover:text-theatre"
          >
            {allTicked ? "Clear page" : "Select page"}
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-heartbeat">{error}</p>}

      {groups.length === 0 ? (
        <p className="rounded-card border border-hairline bg-porcelain p-5 text-sm text-greentop">
          {show === "unreviewed"
            ? "Every value group has been reviewed."
            : "No groups reviewed yet."}
        </p>
      ) : (
        <ul className="space-y-4">
          {groups.map((group) => {
            const ids = group.facts.map((f) => f.id);
            const groupTicked = ids.every((id) => selected.has(id));
            const live = group.facts.filter((f) => !f.excluded).length;
            return (
              <li
                key={group.value}
                className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={groupTicked}
                      onChange={() => setMany(ids, !groupTicked)}
                      className="h-4 w-4 accent-heartbeat"
                    />
                    <span className="font-mono text-base font-medium text-heartbeat">
                      {group.value}
                    </span>
                  </label>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-graphite/55">
                      {live} of {group.facts.length} in use
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => markGroupReviewed(ids))}
                      className="rounded-card border border-hairline px-2.5 py-1 text-xs font-medium text-graphite/70 hover:border-greentop hover:text-theatre disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  </span>
                </div>

                {/* A pairing only teaches if at least two facts survive. */}
                {live < 2 && (
                  <p className="mt-2 font-mono text-[11px] text-graphite/50">
                    Fewer than two in use — this value will not appear under any
                    answer.
                  </p>
                )}

                <ul className="mt-3 space-y-2">
                  {group.facts.map((fact) => {
                    const ticked = selected.has(fact.id);
                    return (
                      <li key={fact.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${
                            ticked
                              ? "border-greentop bg-sage/50"
                              : fact.excluded
                                ? "border-dashed border-hairline opacity-55"
                                : "border-hairline bg-white/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggle(fact.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-heartbeat"
                          />
                          <span className="min-w-0 flex-1">
                            {fact.subject && (
                              <span className="block text-sm font-medium text-graphite">
                                {fact.subject}
                              </span>
                            )}
                            <span className="mt-0.5 block text-sm text-graphite/75">
                              {fact.statement}
                            </span>
                            {fact.reference && (
                              <span className="mt-1 block font-mono text-[11px] text-graphite/50">
                                {fact.reference}
                              </span>
                            )}
                          </span>
                          {fact.excluded && (
                            <span className="shrink-0 rounded-full border border-heartbeat/40 px-2 py-0.5 font-mono text-[10px] text-heartbeat">
                              declined
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-graphite/60">
          <span className="font-mono text-xs">
            page {page} of {pageCount} · {totalInFilter} groups
          </span>
          <span className="flex gap-1">
            {page > 1 && (
              <Link
                href={`/admin/similar-values?show=${show}&page=${page - 1}`}
                className="rounded px-2 py-1 hover:text-theatre"
              >
                ← Prev
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/admin/similar-values?show=${show}&page=${page + 1}`}
                className="rounded px-2 py-1 hover:text-theatre"
              >
                Next →
              </Link>
            )}
          </span>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-porcelain/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-3">
            <span className="font-mono text-xs text-graphite/70">
              {selectedIds.length} selected
              {declinedSelected.length > 0 && liveSelected.length > 0 && (
                <span className="text-graphite/50">
                  {" "}
                  ({liveSelected.length} in use, {declinedSelected.length}{" "}
                  declined)
                </span>
              )}
            </span>
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-card border border-hairline px-3 py-1.5 text-xs font-medium text-graphite/70 hover:text-theatre"
              >
                Clear
              </button>
              {declinedSelected.length > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() => setFactsExcluded(declinedSelected, false))
                  }
                  className="rounded-card border border-greentop px-4 py-1.5 text-xs font-medium text-greentop hover:bg-greentop hover:text-porcelain disabled:opacity-50"
                >
                  Restore {declinedSelected.length}
                </button>
              )}
              {liveSelected.length > 0 && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() => setFactsExcluded(liveSelected, true))
                  }
                  className="rounded-card bg-heartbeat px-4 py-1.5 text-xs font-medium text-porcelain hover:bg-theatre disabled:opacity-50"
                >
                  Decline {liveSelected.length}
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
