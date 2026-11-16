"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { CONFIDENCE_LABELS, CONFIDENCE_ORDER, type Confidence } from "@/lib/confidence";
import { saveConfidence } from "./actions";

export type TopicGroup = { heading: string; topics: { id: number; title: string }[] };

/**
 * Three choices on one track, the chosen one filled in the brand green,
 * as the site's other choices are (the Practise format tabs, the exam
 * part on Account). It was three outlined pills a row in red, amber and
 * green, which read as scores, and "Not confident" broke over two lines
 * in every row (owner, 16 November 2026: "doesn't aesthetically match
 * the website"). Choosing the chosen one again clears it.
 */
function ConfidenceChoice({
  value,
  onChoose,
  labelledBy,
  label,
}: {
  value: Confidence | null;
  onChoose: (c: Confidence) => void;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-label={label}
      className="flex w-full shrink-0 rounded-full border border-line bg-sunk p-0.5 sm:inline-flex sm:w-auto"
    >
      {CONFIDENCE_ORDER.map((c) => {
        const chosen = value === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChoose(c)}
            className={`h-9 flex-1 whitespace-nowrap rounded-full px-3.5 font-ui text-[14px] font-medium transition-colors duration-fast sm:flex-none ${
              chosen ? "bg-brand text-on-brand shadow-card" : "text-ink/70 hover:text-ink-strong"
            }`}
          >
            {CONFIDENCE_LABELS[c]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One row per topic, under its heading, none chosen to begin with: a
 * default would be a rating the candidate never gave. A heading can be
 * rated whole, and shows the rating when every topic under it shares it.
 */
export function TopicsForm({
  groups,
  initial,
  next,
}: {
  groups: TopicGroup[];
  initial: Record<number, Confidence>;
  /** Where saving goes: the plan for a subscriber, Today for a free account. */
  next: string;
}) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<number, Confidence | null>>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = groups.reduce((n, g) => n + g.topics.length, 0);
  const rated = Object.values(ratings).filter(Boolean).length;

  function rate(id: number, value: Confidence) {
    setRatings((r) => ({ ...r, [id]: r[id] === value ? null : value }));
  }

  function rateGroup(group: TopicGroup, value: Confidence) {
    setRatings((r) => {
      const all = group.topics.every((t) => r[t.id] === value);
      const next = { ...r };
      for (const t of group.topics) next[t.id] = all ? null : value;
      return next;
    });
  }

  const groupValue = (group: TopicGroup): Confidence | null => {
    const first = ratings[group.topics[0].id] ?? null;
    return first && group.topics.every((t) => ratings[t.id] === first) ? first : null;
  };

  function save() {
    setError(null);
    startTransition(async () => {
      const entries = Object.entries(ratings).map(([id, confidence]) => ({ section_id: Number(id), confidence }));
      const result = await saveConfidence(entries);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <div>
      {groups.map((group) => {
        const headingId = `group-${group.topics[0].id}`;
        return (
          <section key={group.heading} className="mb-8" aria-labelledby={headingId}>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <h2 id={headingId} className="font-display text-[21px] font-medium text-ink-strong">
                {group.heading}
              </h2>
              {group.topics.length > 1 && (
                <div className="flex items-center gap-2 sm:pr-4">
                  <span className="shrink-0 font-ui text-[13px] text-ink/65">All of them</span>
                  <ConfidenceChoice
                    value={groupValue(group)}
                    onChoose={(c) => rateGroup(group, c)}
                    label={`Rate every topic in ${group.heading}`}
                  />
                </div>
              )}
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {group.topics.map((topic) => (
                <li
                  key={topic.id}
                  className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span id={`topic-${topic.id}`} className="font-ui text-[16px] font-semibold text-ink-strong">
                    {topic.title}
                  </span>
                  <ConfidenceChoice
                    value={ratings[topic.id] ?? null}
                    onChoose={(c) => rate(topic.id, c)}
                    labelledBy={`topic-${topic.id}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-card sm:border sm:shadow-card">
        {error && <p className="mb-2 font-ui text-[15px] text-accent-ink">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-ui text-[14px] tabular-nums text-ink/70">
            {rated} of {total} rated{rated < total ? ". Leave any you cannot judge." : "."}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push("/")} className={buttonClass("quiet", "md")}>
              Skip for now
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || (rated === 0 && Object.keys(initial).length === 0)}
              className={buttonClass("primary", "md")}
            >
              {pending ? "Saving…" : next === "/plan" ? "Save and see my plan" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
