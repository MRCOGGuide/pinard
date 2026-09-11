"use client";

import { useState, useTransition } from "react";
import type { QuestionOption } from "@/lib/types";

export type ExplanationEdit = {
  key: string;
  verdict: "correct" | "incorrect";
  text: string;
  citation_chunk_ids: number[];
  source_reference: string;
};

export type QuestionEditInput = {
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  /** The paragraph the candidate reads under the card. */
  explanation: string;
  explanations: ExplanationEdit[];
};

/**
 * Shared question editor used by the review queue (pending questions)
 * and the bank (approved questions). The caller supplies the save
 * action; citations are preserved and not editable here.
 */
export function QuestionEditForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: QuestionEditInput;
  onCancel: () => void;
  onSave: (input: QuestionEditInput) => Promise<{ error?: string }>;
}) {
  const [stem, setStem] = useState(initial.stem);
  const [options, setOptions] = useState<QuestionOption[]>(initial.options);
  const [correctKey, setCorrectKey] = useState(initial.correct_key);
  const [explanation, setExplanation] = useState(initial.explanation ?? "");
  const [explanations, setExplanations] = useState<ExplanationEdit[]>(
    initial.explanations
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await onSave({
        stem,
        options,
        correct_key: correctKey,
        explanation,
        explanations,
      });
      if (result.error) setError(result.error);
    });
  }

  const field =
    "w-full rounded-card border border-line bg-raised px-3 py-2 text-sm";

  return (
    <div className="rounded-card border border-good/40 bg-surface p-5 shadow-card">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
        Editing
      </p>

      <label className="mt-3 block text-sm font-medium">
        Stem
        <textarea
          value={stem}
          onChange={(e) => setStem(e.target.value)}
          rows={4}
          className={`mt-1 ${field}`}
        />
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">
          Options (select the correct one)
        </legend>
        <div className="mt-1 space-y-2">
          {options.map((o, i) => (
            <div key={o.key} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={correctKey === o.key}
                onChange={() => setCorrectKey(o.key)}
                className="accent-good"
              />
              <span className="w-4 font-mono text-xs text-ink/60">
                {o.key}
              </span>
              <input
                value={o.text}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, text: e.target.value } : p
                    )
                  )
                }
                className="min-w-0 flex-1 rounded-card border border-line bg-raised px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block text-sm font-medium">
        Explanation shown on the card
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={4}
          className={`mt-1 ${field}`}
        />
        <span className="mt-1 block text-xs font-normal text-ink/50">
          One paragraph: why the answer is right, then the others
          dismissed briefly. This is all the candidate reads.
        </span>
      </label>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">
          Per-option working (admin only)
        </legend>
        <div className="mt-1 space-y-2">
          {explanations.map((e, i) => (
            <div key={e.key} className="flex items-start gap-2">
              <span className="mt-2 w-4 font-mono text-xs text-ink/60">
                {e.key}
              </span>
              <textarea
                value={e.text}
                onChange={(ev) =>
                  setExplanations((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, text: ev.target.value } : p
                    )
                  )
                }
                rows={2}
                className="min-w-0 flex-1 rounded-card border border-line bg-raised px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/50">
          Citations are preserved from generation and can&rsquo;t be edited here.
        </p>
      </fieldset>

      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-card bg-brand px-5 py-2 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-line bg-surface px-4 py-2 text-sm font-medium text-ink/70 hover:text-ink-strong"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
