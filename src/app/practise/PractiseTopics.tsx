"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui";
import { CoverageBar } from "@/components/CoverageBar";
import { GradeBar } from "@/components/GradeBar";
import { ScrollFade } from "@/components/scroll";
import { ModuleMark, moduleKind } from "@/components/ModuleMark";
import { Fact, FactsRow } from "@/components/progress/ProgressParts";
import { thirdBand } from "@/lib/performance";

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

/** The topic in a module with most left to do, by share unanswered; ties in syllabus order. */
function nextTopic(topics: PractiseTopic[], kind: Kind): PractiseTopic | null {
  let best: PractiseTopic | null = null;
  let bestShare = -1;
  for (const t of topics) {
    const held = t.held[kind];
    if (held === 0 || t.seen[kind] >= held) continue;
    const share = 1 - t.seen[kind] / held;
    if (share > bestShare) {
      best = t;
      bestShare = share;
    }
  }
  return best;
}

/**
 * Practise: the format tabs and the syllabus under them, in the manner
 * of Progress and Mock (owner, 17 November 2026: "doesn't look like
 * Mock/Progress Page - Fix it to match the aesthetics. Make it
 * Obstetrics then Gynaecology then Governance then high impact papers
 * and add logos to them, make them collapsible menus").
 *
 * A row of figures as Progress opens with, for the chosen kind; then
 * each module as a card that opens and closes (as the plan's weeks do),
 * headed by its emblem, its size, how much of it has been answered, and
 * the topic in it with most left to do, which is also marked in the list.
 * Several can be open at once; the first, at the top, is open to begin
 * with.
 *
 * The tabs switch in the browser: each was a link that rebuilt the page
 * on the server (owner, 17 November: "switching between both/SBA/EMQ is
 * slow"). The address follows the tab, so a topic's "Exit to topics"
 * comes back to it.
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
  const base = useId();

  /*
    The green fill slides to the chosen tab rather than jumping (owner,
    17 November 2026: "improve button transition in practise"). It is
    measured from the tab itself, so it fits whatever the counts make
    the tabs' widths, and is measured again if they change. Until the
    first measurement, or on a page not laid out, the chosen tab carries
    its own fill; the first placement does not slide, only the moves
    after it.
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
    .map((g) => {
      const topics = g.topics.filter((t) => t.held[kind] > 0);
      const held = topics.reduce((n, t) => n + t.held[kind], 0);
      const seen = topics.reduce((n, t) => n + t.seen[kind], 0);
      // A module of one topic (High-Impact Articles) has no choice of "next" to offer.
      return { ...g, topics, held, seen, next: topics.length > 1 ? nextTopic(topics, kind) : null };
    })
    .filter((g) => g.topics.length > 0);

  // Open to begin with: the first module, at the top of the page (owner, 17 November 2026: the
  // one with most left to do was High-Impact Articles, opening at the foot of the page).
  const [open, setOpen] = useState<Set<string>>(() => new Set(shown[0] ? [shown[0].heading] : []));
  const toggle = (heading: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });

  const answered = shown.reduce((n, g) => n + g.seen, 0);
  const held = shown.reduce((n, g) => n + g.held, 0);
  const topicCount = shown.reduce((n, g) => n + g.topics.length, 0);
  const begun = shown.reduce((n, g) => n + g.topics.filter((t) => t.seen[kind] > 0).length, 0);
  const finished = shown.reduce((n, g) => n + g.topics.filter((t) => t.seen[kind] >= t.held[kind]).length, 0);

  return (
    <>
      {/* One track, the chosen format filled in the brand green. */}
      <div
        ref={track}
        role="tablist"
        aria-label="Question format"
        className="relative inline-flex rounded-full border border-line bg-sunk p-1"
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
          <div className="mt-8">
            <EmptyState title={kind === "all" ? "No topics yet" : `No ${kind.toUpperCase()} questions yet`}>
              {kind === "all"
                ? "Questions for this paper are still being written and approved. They appear here as soon as they are ready."
                : "Try the other format, or both together."}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Where they stand, for the chosen kind, as Progress opens. */}
            <FactsRow>
              <Fact label="Questions answered" value={answered} of={held} band={thirdBand(answered, held)} />
              <Fact label="Topics begun" value={begun} of={topicCount} band={thirdBand(begun, topicCount)} />
              <Fact label="Topics finished" value={finished} of={topicCount} band={thirdBand(finished, topicCount)} />
            </FactsRow>

            <div className="mt-8 space-y-4">
              {shown.map((group) => {
                const isOpen = open.has(group.heading);
                const panel = `${base}-${group.heading}`;
                const pct = group.held ? Math.round((group.seen / group.held) * 100) : 0;
                return (
                  <ScrollFade
                    key={group.heading}
                    as="div"
                    className={`module-card overflow-hidden rounded-card border bg-surface shadow-card transition-colors duration-200 ${
                      isOpen ? "border-good/35" : "border-line"
                    }`}
                  >
                    <div data-open={isOpen || undefined} className="faq-item">
                      <h2>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={panel}
                          onClick={() => toggle(group.heading)}
                          className="w-full px-4 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-good sm:px-5"
                        >
                          <span className="flex items-center gap-4">
                            <ModuleMark kind={moduleKind(group.heading)} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-display text-[22px] font-medium leading-snug text-ink-strong">
                                {group.heading}
                              </span>
                              <span className="mt-0.5 block font-ui text-[14px] text-ink/65">
                                {group.topics.length} topic{group.topics.length === 1 ? "" : "s"},{" "}
                                {group.held.toLocaleString("en-GB")} question{group.held === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-display text-[22px] leading-none tabular-nums text-ink-strong">{pct}%</span>
                              <span className="mt-1 block font-ui text-[12px] text-ink/65">answered</span>
                            </span>
                            <svg viewBox="0 0 16 16" className="faq-chevron h-4 w-4 shrink-0 text-ink/55" aria-hidden="true">
                              <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <GradeBar percent={pct} className="mt-3 h-1.5" />
                          {group.next && (
                            <span className="mt-2 block font-ui text-[14px] text-ink/70">
                              Next: <span className="font-semibold text-ink-strong">{group.next.title}</span>
                            </span>
                          )}
                        </button>
                      </h2>
                      <div id={panel} role="region" aria-label={group.heading} className="faq-panel" inert={!isOpen}>
                        <div>
                          {/* One column: a syllabus is a list, and a list reads down. */}
                          <ul className="divide-y divide-line border-t border-line">
                            {group.topics.map((t) => {
                              const n = t.held[kind];
                              const isNext = group.next?.id === t.id;
                              return (
                                <li key={t.id}>
                                  <Link
                                    href={`/practise/${t.id}${kind === "all" ? "" : `?format=${kind}`}`}
                                    className="block px-4 py-3.5 transition-colors duration-fast hover:bg-sunk focus-visible:bg-sunk sm:px-5"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="inline-flex min-w-0 items-center gap-2 font-ui text-[16px] font-semibold text-ink-strong">
                                        {t.title}
                                        {isNext && (
                                          <span className="shrink-0 rounded-full bg-good/10 px-2 py-0.5 font-ui text-[12px] font-semibold text-good">
                                            Next
                                          </span>
                                        )}
                                      </span>
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
                        </div>
                      </div>
                    </div>
                  </ScrollFade>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
