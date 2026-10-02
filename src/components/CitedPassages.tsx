"use client";

import { useCallback, useEffect, useState } from "react";
import { getCitedPassages, type CitedPassage } from "@/app/session/actions";
import { formatReference } from "@/lib/reference";
import type { SessionQuestion } from "@/lib/session";

/**
 * The paragraph the answer was written from, under the answer.
 *
 * Every other bank in this exam asserts; this one can show. The card
 * already named its sources, which is a claim about provenance, and
 * the passage is the provenance itself: a candidate who doubts an
 * explanation, or wants the sentence either side of it, opens this and
 * reads what the guideline says.
 *
 * Closed by default, because the explanation is the teaching and the
 * passage is the evidence for it, and evidence that is always open is
 * just a longer card. Open with S, from anywhere on the question.
 *
 * Fetched on first open rather than with the question: most candidates
 * will not open it on most questions, and a session that loaded every
 * passage would carry the weight of the library through every card.
 */
export function CitedPassages({
  question,
  open,
  onOpenChange,
}: {
  question: SessionQuestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [passages, setPassages] = useState<CitedPassage[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (passages || loading) return;
    setLoading(true);
    try {
      setPassages(await getCitedPassages(question.id));
    } catch {
      setPassages([]);
    } finally {
      setLoading(false);
    }
  }, [passages, loading, question.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const sources = question.sources;
  if (sources.length === 0 && !open) return null;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="font-mono text-label uppercase tracking-wide text-ink/50">
          {sources.length === 1 ? "Source" : "Sources"}
        </p>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          className="font-mono text-label text-good underline-offset-2 hover:underline"
        >
          {open ? "Hide the passage" : "Read the passage"}
          <span className="ml-1.5 text-ink/40">S</span>
        </button>
      </div>

      <ul className="mt-1.5 space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs leading-relaxed text-ink/70">
            <span className="font-medium text-ink/85">{s.title}</span>
            {formatReference(s) && (
              <span className="text-ink/60"> · {formatReference(s)}</span>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && (
            <p className="font-mono text-label text-ink/50">
              Fetching the passage…
            </p>
          )}
          {passages?.length === 0 && !loading && (
            /*
              Said plainly rather than hidden. A question whose passage
              cannot be shown is a question whose citation needs
              looking at, and a candidate seeing nothing where the
              button promised something would reasonably assume the
              bank is bluffing.
            */
            <p className="text-xs leading-relaxed text-ink/60">
              The passage behind this one is not available to show. Its
              source is named above.
            </p>
          )}
          {passages?.map((p) => (
            <figure
              key={p.id}
              className="rounded-card border border-line bg-raised/60 p-3"
            >
              <blockquote className="whitespace-pre-line text-xs leading-relaxed text-ink/85">
                {p.text}
              </blockquote>
              <figcaption className="mt-2 font-mono text-label text-ink/50">
                {p.title}
                {p.reference && ` · ${p.reference}`}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
