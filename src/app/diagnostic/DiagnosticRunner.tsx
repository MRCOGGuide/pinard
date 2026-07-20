"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import { recordAnswer } from "@/app/session/actions";
import { completeDiagnostic } from "./actions";

/**
 * Screening-style runner: answers are recorded silently (no per-question
 * feedback), then the topic map is revealed at the end.
 */
export function DiagnosticRunner({
  questions,
}: {
  questions: SessionQuestion[];
}) {
  const router = useRouter();
  const sessionId = useRef(crypto.randomUUID());
  const startedAt = useRef(Date.now());
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[index];
  const progress = Math.round((index / questions.length) * 100);

  async function choose(key: string) {
    if (saving || finishing) return;
    setSaving(true);
    setError(null);
    const seconds = (Date.now() - startedAt.current) / 1000;
    const result = await recordAnswer({
      questionId: q.id,
      chosenKey: key,
      secondsTaken: seconds,
      sessionId: sessionId.current,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    if (index + 1 < questions.length) {
      setIndex(index + 1);
      startedAt.current = Date.now();
    } else {
      setFinishing(true);
      await completeDiagnostic();
      router.push("/diagnostic/results");
      router.refresh();
    }
  }

  if (finishing) {
    return (
      <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
        <p className="text-sm text-graphite/70">Mapping your topics…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm text-graphite/60">
          <span className="font-mono">
            {index + 1} / {questions.length}
          </span>
          <span className="text-xs">{q.section_title}</span>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-hairline"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-heartbeat transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
        {q.lead_in && (
          <p className="text-sm italic text-graphite/70">{q.lead_in}</p>
        )}
        <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
          {q.stem}
        </p>

        <ul className="mt-5 space-y-2">
          {q.options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                disabled={saving}
                onClick={() => choose(o.key)}
                className="flex w-full gap-3 rounded-card border border-hairline bg-white px-4 py-3 text-left text-sm transition-colors hover:border-greentop hover:bg-sage disabled:opacity-60"
              >
                <span className="font-mono text-xs leading-5 text-graphite/60">
                  {o.key}
                </span>
                <span className="text-graphite">{o.text}</span>
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}
        {saving && (
          <p className="mt-3 text-xs text-graphite/50">Recording…</p>
        )}
      </article>
    </div>
  );
}
