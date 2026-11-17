"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import { CoverageBar } from "@/components/CoverageBar";
import { ScrollFade } from "@/components/scroll";

export type Kind = "all" | "sba" | "emq";
export type PractiseTopic = {
  id: number;
  title: string;
  /** Approved questions in the topic, of each kind. */
  held: Record<Kind, number>;
  /** Of those, the ones this candidate has answered. */
  seen: Record<Kind, number>;
};
export type PractiseGroup = { heading: string; topics: PractiseTopic[] };

const TABS: { value: Kind; label: string }[] = [
  { value: "all", label: "Both" },
  { value: "sba", label: "SBA" },
  { value: "emq", label: "EMQ" },
];

/**
 * The format tabs and the topics under them, switched in the browser.
 *
 * Each tab was a link that rebuilt the page on the server: access, the
 * profile, the syllabus, flagged questions, every approved question and
 * every answer the candidate has given, one after another, to filter one
 * list (owner, 17 November 2026: "switching between both/SBA/EMQ is
 * slow"). Every count for every kind is now worked out once, and a tab
 * only changes what is shown. The address still follows the tab, so a
 * topic's "Exit to topics" comes back to it.
 */
export function PractiseTopics({
  groups,
  totals,
  initial,
}: {
  groups: PractiseGroup[];
  totals: Record<Kind, number>;
  initial: Kind;
}) {
  const [kind, setKind] = useState<Kind>(initial);

  /*
    The green fill slides to the chosen tab rather than jumping (owner,
    17 November 2026: "improve button transition in practise"). It is
    measured from the tab itself, so it fits whatever the counts make
    the tabs' widths, and is measured again if they change. Until the
    first measurement the chosen tab carries its own fill, so the page
    never opens with the fill missing; the first placement does not
    slide, only the moves after it.
  */
  const track = useRef<HTMLDivElement>(null);
  const tabs = useRef<Partial<Record<Kind, HTMLButtonElement | null>>>({});
  const [fill, setFill] = useState<{ left: number; width: number; slide: boolean } | null>(null);
  const placed = useRef<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = (slide: boolean) => {
      const tab = tabs.current[kind];
      if (!tab) return;
      const at = { left: tab.offsetLeft, width: tab.offsetWidth };
      // Not laid out (a hidden page): keep the tab's own fill rather than place one of no width.
      if (at.width === 0) return;
      // The observer reports once on attaching; only a real change moves the fill.
      if (!slide && placed.current && placed.current.left === at.left && placed.current.width === at.width) return;
      placed.current = at;
      setFill({ ...at, slide });
    };
    place(placed.current !== null);
    const observer = new ResizeObserver(() => place(false));
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function choose(next: Kind) {
    setKind(next);
    // The address follows, without a trip to the server.
    window.history.replaceState(null, "", next === "all" ? "/practise" : `/practise?format=${next}`);
  }

  const shown = groups
    .map((g) => ({ ...g, topics: g.topics.filter((t) => t.held[kind] > 0) }))
    .filter((g) => g.topics.length > 0);

  return (
    <>
      {/* One track, the chosen format filled in the brand green, as the
          topic survey's choices are, with each count a quiet figure beside
          its name (owner, 17 November 2026). */}
      <div
        ref={track}
        role="tablist"
        aria-label="Question format"
        className="relative mb-6 inline-flex rounded-full border border-line bg-sunk p-1"
      >
        {fill && (
          <span
            aria-hidden="true"
            className={`absolute bottom-1 left-0 top-1 rounded-full bg-brand shadow-card motion-reduce:transition-none ${
              fill.slide ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]" : ""
            }`}
            style={{ width: fill.width, transform: `translateX(${fill.left}px)` }}
          />
        )}
        {TABS.map((tab) => {
          const current = kind === tab.value;
          return (
            <button
              key={tab.value}
              ref={(el) => {
                tabs.current[tab.value] = el;
              }}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => choose(tab.value)}
              className={`relative z-10 inline-flex h-9 items-center gap-2 rounded-full px-4 font-ui text-[14px] font-semibold transition-colors duration-300 ${
                current
                  ? `text-on-brand ${fill ? "" : "bg-brand shadow-card"}`
                  : "text-ink/70 hover:bg-surface/70 hover:text-ink-strong"
              }`}
            >
              {tab.label}
              <span className={`font-medium tabular-nums transition-opacity duration-300 ${current ? "opacity-75" : "opacity-60"}`}>
                {totals[tab.value].toLocaleString("en-GB")}
              </span>
            </button>
          );
        })}
      </div>

      {/* The list fades in afresh when the kind changes, rather than snapping. */}
      <div key={kind} className="fade-in">
      {shown.length === 0 ? (
        <EmptyState title={kind === "all" ? "No topics yet" : `No ${kind.toUpperCase()} questions yet`}>
          {kind === "all"
            ? "Questions for this paper are still being written and approved. They appear here as soon as they are ready."
            : "Try the other format, or both together."}
        </EmptyState>
      ) : (
        shown.map((group) => (
          <ScrollFade key={group.heading} className="mb-8">
            <h2 className="mb-2 font-display text-[21px] font-medium text-ink-strong">{group.heading}</h2>
            {/* One column: a syllabus is a list, and a list reads down. */}
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {group.topics.map((t) => {
                const n = t.held[kind];
                return (
                  <li key={t.id}>
                    <Link
                      href={`/practise/${t.id}${kind === "all" ? "" : `?format=${kind}`}`}
                      className="block px-4 py-3.5 transition-colors duration-fast hover:bg-sunk focus-visible:bg-sunk"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-ui text-[16px] font-semibold text-ink-strong">{t.title}</span>
                        <span className="shrink-0 font-ui text-[14px] tabular-nums text-ink/65">
                          {n} question{n === 1 ? "" : "s"}
                        </span>
                      </div>
                      <CoverageBar done={t.seen[kind]} total={n} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </ScrollFade>
        ))
      )}
      </div>
    </>
  );
}
