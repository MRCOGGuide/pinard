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
        explanations,
      });
      if (result.error) setError(result.error);
    });
  }

  const field =
    "w-full rounded-card border border-hairline bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-card border border-greentop/40 bg-porcelain p-5 shadow-card">
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
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
                className="accent-greentop"
              />
              <span className="w-4 font-mono text-xs text-graphite/60">
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
                className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">Explanations</legend>
        <div className="mt-1 space-y-2">
          {explanations.map((e, i) => (
            <div key={e.key} className="flex items-start gap-2">
              <span className="mt-2 w-4 font-mono text-xs text-graphite/60">
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
                className="min-w-0 flex-1 rounded-card border border-hairline bg-white px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-graphite/50">
          Citations are preserved from generation and can&rsquo;t be edited here.
        </p>
      </fieldset>

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-card bg-theatre px-5 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
