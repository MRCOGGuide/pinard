"use client";

import { useTransition } from "react";
import { Button, EmptyState, NONE } from "@/components/ui";
import type { FeedbackItem } from "@/lib/pilot";
import { markRead } from "./actions";

/**
 * What the cohort said, newest first.
 *
 * Shown whole rather than summarised: ten people's sentences are
 * readable, and the one thing a pilot produces that nothing else can
 * is the sentence you did not expect.
 */
export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <EmptyState title="Nothing yet">
        The box sits under every page for anyone signed in. It fills up
        once the cohort is in.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li
          key={f.id}
          className={`rounded-card border p-4 ${
            f.readAt ? "border-line bg-surface" : "border-good/40 bg-sunk"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-mono text-label text-ink/65">
              {f.email ?? NONE}
              {f.path ? ` · ${f.path}` : ""}
            </span>
            <span className="font-mono text-label text-ink/65">
              {f.createdAt.slice(0, 10)}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {f.message}
          </p>
          {!f.readAt && (
            <Button
              size="sm"
              variant="quiet"
              className="mt-2"
              disabled={pending}
              onClick={() => startTransition(() => markRead(f.id))}
            >
              Mark read
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
