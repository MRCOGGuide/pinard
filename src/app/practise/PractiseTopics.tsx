"use client";

import Link from "next/link";
import { useState } from "react";
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
      <div role="tablist" aria-label="Question format" className="mb-6 inline-flex rounded-full border border-line bg-sunk p-1">
        {TABS.map((tab) => {
          const current = kind === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={current}
              onClick={() => choose(tab.value)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 font-ui text-[14px] font-semibold transition-colors duration-fast ${
                current ? "bg-brand text-on-brand shadow-card" : "text-ink/70 hover:text-ink-strong"
              }`}
            >
              {tab.label}
              <span className={`font-medium tabular-nums ${current ? "opacity-75" : "opacity-60"}`}>
                {totals[tab.value].toLocaleString("en-GB")}
              </span>
            </button>
          );
        })}
      </div>

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
    </>
  );
}
