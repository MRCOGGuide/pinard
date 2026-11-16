"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { CONFIDENCE_LABELS, CONFIDENCE_ORDER, type Confidence } from "@/lib/confidence";
import { saveConfidence } from "./actions";

export type TopicGroup = { heading: string; topics: { id: number; title: string }[] };

/* Each choice in its own colour once chosen, so a page of ratings reads at a glance. */
const CHOSEN: Record<Confidence, string> = {
  not_confident: "border-accent bg-accent/10 text-accent-ink",
  unsure: "border-warn bg-warn/10 text-ink-strong",
  confident: "border-good bg-good/10 text-good",
};

/**
 * One row per topic, three choices, none chosen to begin with: a default
 * would be a rating the candidate never gave. Choosing the chosen one
 * again clears it.
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
      const next = { ...r };
      for (const t of group.topics) next[t.id] = value;
      return next;
    });
  }

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
      {groups.map((group) => (
        <section key={group.heading} className="mb-8" aria-labelledby={`group-${group.topics[0].id}`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id={`group-${group.topics[0].id}`} className="font-display text-[21px] font-medium text-ink-strong">
              {group.heading}
            </h2>
            {group.topics.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 font-ui text-[13px] text-ink/65">
                <span>Rate all:</span>
                {CONFIDENCE_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => rateGroup(group, c)}
                    className="rounded-full border border-line px-2.5 py-1 hover:border-good/60 hover:text-ink-strong"
                  >
                    {CONFIDENCE_LABELS[c]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {group.topics.map((topic) => (
              <li key={topic.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <span id={`topic-${topic.id}`} className="font-ui text-[16px] font-semibold text-ink-strong">
                  {topic.title}
                </span>
                <div role="group" aria-labelledby={`topic-${topic.id}`} className="grid shrink-0 grid-cols-3 gap-1.5 sm:w-[330px]">
                  {CONFIDENCE_ORDER.map((c) => {
                    const chosen = ratings[topic.id] === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => rate(topic.id, c)}
                        className={`min-h-10 rounded-full border px-2 font-ui text-[14px] font-medium transition-colors duration-fast ${
                          chosen ? CHOSEN[c] : "border-line bg-surface text-ink/70 hover:text-ink-strong"
                        }`}
                      >
                        {CONFIDENCE_LABELS[c]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface px-4 py-3 sm:mx-0 sm:rounded-card sm:border">
        {error && <p className="mb-2 font-ui text-[15px] text-accent-ink">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-ui text-[14px] tabular-nums text-ink/70">
            {rated} of {total} rated{rated < total ? ". Leave any you cannot judge." : "."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                router.push("/");
              }}
              className={buttonClass("quiet", "md")}
            >
              Skip for now
            </button>
            <button type="button" onClick={save} disabled={pending || (rated === 0 && Object.keys(initial).length === 0)} className={buttonClass("primary", "md")}>
              {pending ? "Saving…" : next === "/plan" ? "Save and see my plan" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
