"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PAGE_SIZES, Pager } from "@/components/ui";
import type { ValueGroup } from "@/lib/similarValues";
import { markGroupReviewed, setFactsExcluded } from "./actions";

/**
 * How many facts a group shows before asking.
 *
 * Groups are sorted with the largest first, so a page of ten carries
 * over a thousand facts — "50%" alone has hundreds. Paging by group
 * without this is still a page you scroll for a minute. Selecting the
 * group still takes every fact in it, shown or not, so the bulk
 * workflow is unaffected.
 */
const FACTS_SHOWN = 6;

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
  perPage,
  firstShown,
  totalInFilter,
}: {
  groups: ValueGroup[];
  show: "unreviewed" | "reviewed";
  page: number;
  pageCount: number;
  perPage: number;
  firstShown: number;
  totalInFilter: number;
}) {
  const router = useRouter();
  const listTop = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Filter, page and size all live in the URL, so a link to a page
  // means the same thing when it is opened again, and the back button
  // does what it looks like it should.
  const hrefFor = (next: { show?: string; page?: number; per?: number }) => {
    const params = new URLSearchParams({
      show: next.show ?? show,
      page: String(next.page ?? page),
      per: String(next.per ?? perPage),
    });
    return `/admin/similar-values?${params.toString()}`;
  };

  function goToPage(next: number) {
    router.push(hrefFor({ page: next }), { scroll: false });
    // A new page starts at its first group, as on the bank.
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tab = (value: "unreviewed" | "reviewed", label: string) => (
    <Link
      href={hrefFor({ show: value, page: 1 })}
      className={`rounded-card border px-2.5 py-1 text-xs font-medium ${
        show === value
          ? "border-brand bg-brand text-on-brand"
          : "border-line bg-surface text-ink/70 hover:text-ink-strong"
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
            className="ml-2 rounded-card border border-line px-2.5 py-1 text-xs font-medium text-ink/70 hover:border-good hover:text-ink-strong"
          >
            {allTicked ? "Clear page" : "Select page"}
          </button>
        )}

        <span className="ml-auto font-mono text-xs text-ink/55">
          {totalInFilter === 0
            ? "none shown"
            : `showing ${firstShown + 1}–${firstShown + groups.length} of ${totalInFilter}`}
        </span>
        <label className="flex items-center gap-1.5 font-mono text-xs text-ink/55">
          Per page
          <select
            value={perPage}
            onChange={(e) =>
              router.push(hrefFor({ per: Number(e.target.value), page: 1 }), {
                scroll: false,
              })
            }
            className="rounded-card border border-line bg-raised px-1.5 py-1 text-xs"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-accent-ink">{error}</p>}

      <div ref={listTop} className="scroll-mt-4" />

      {groups.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-5 text-sm text-good">
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
                className="rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={groupTicked}
                      onChange={() => setMany(ids, !groupTicked)}
                      className="h-4 w-4 accent-accent"
                    />
                    <span className="font-mono text-base font-medium text-accent-ink">
                      {group.value}
                    </span>
                  </label>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-ink/55">
                      {live} of {group.facts.length} in use
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => markGroupReviewed(ids))}
                      className="rounded-card border border-line px-2.5 py-1 text-xs font-medium text-ink/70 hover:border-good hover:text-ink-strong disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  </span>
                </div>

                {/* A pairing only teaches if at least two facts survive. */}
                {live < 2 && (
                  <p className="mt-2 font-mono text-[11px] text-ink/50">
                    Fewer than two in use — this value will not appear under any
                    answer.
                  </p>
                )}

                <ul className="mt-3 space-y-2">
                  {(expanded.has(group.value)
                    ? group.facts
                    : group.facts.slice(0, FACTS_SHOWN)
                  ).map((fact) => {
                    const ticked = selected.has(fact.id);
                    return (
                      <li key={fact.id}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-card border p-3 ${
                            ticked
                              ? "border-good bg-sunk/50"
                              : fact.excluded
                                ? "border-dashed border-line opacity-55"
                                : "border-line bg-raised/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={ticked}
                            onChange={() => toggle(fact.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                          />
                          <span className="min-w-0 flex-1">
                            {fact.subject && (
                              <span className="block text-sm font-medium text-ink">
                                {fact.subject}
                              </span>
                            )}
                            <span className="mt-0.5 block text-sm text-ink/75">
                              {fact.statement}
                            </span>
                            {fact.reference && (
                              <span className="mt-1 block font-mono text-[11px] text-ink/50">
                                {fact.reference}
                              </span>
                            )}
                          </span>
                          {fact.excluded && (
                            <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 font-mono text-[10px] text-accent-ink">
                              declined
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {group.facts.length > FACTS_SHOWN && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.value)) next.delete(group.value);
                        else next.add(group.value);
                        return next;
                      })
                    }
                    className="mt-2 font-mono text-[11px] text-ink/60 underline underline-offset-2 hover:text-ink-strong"
                  >
                    {expanded.has(group.value)
                      ? `Show fewer`
                      : `Show all ${group.facts.length}`}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pager
        page={page}
        pageCount={pageCount}
        onPage={goToPage}
        className="mt-6"
      />

      {selectedIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-3">
            <span className="font-mono text-xs text-ink/70">
              {selectedIds.length} selected
              {declinedSelected.length > 0 && liveSelected.length > 0 && (
                <span className="text-ink/50">
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
                className="rounded-card border border-line px-3 py-1.5 text-xs font-medium text-ink/70 hover:text-ink-strong"
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
                  className="rounded-card border border-good px-4 py-1.5 text-xs font-medium text-good hover:bg-good hover:text-on-brand disabled:opacity-50"
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
                  className="rounded-card bg-accent-ink px-4 py-1.5 text-xs font-medium text-on-brand hover:bg-brand disabled:opacity-50"
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
