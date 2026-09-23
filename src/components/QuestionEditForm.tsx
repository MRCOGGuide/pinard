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
  optionsNote,
  onCancel,
  onSave,
}: {
  initial: QuestionEditInput;
  /**
   * What editing this option list will affect — said at the list rather
   * than above the form, because an EMQ set shares one list between its
   * scenarios and a reviewer editing one of them cannot see that.
   */
  optionsNote?: string;
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
          Options — every one editable, radio marks the answer
        </legend>
        {optionsNote && (
          <p className="mt-1 text-xs text-ink/60">{optionsNote}</p>
        )}
        <div className="mt-2 space-y-2">
          {options.map((o, i) => (
            <div key={o.key} className="flex items-start gap-2">
              <input
                type="radio"
                name="correct"
                aria-label={`Option ${o.key} is the answer`}
                checked={correctKey === o.key}
                onChange={() => setCorrectKey(o.key)}
                className="mt-2.5 accent-good"
              />
              <span className="mt-2 w-4 font-mono text-xs text-ink/60">
                {o.key}
              </span>
              <textarea
                value={o.text}
                /*
                  A textarea, not a single line. An EMQ option runs to a
                  hundred characters — "Freeze all embryos and plan
                  frozen embryo transfer (FET) after surgical treatment
                  of hydrosalpinx" — and in a one-line field most of it
                  sat off-screen, which is no way to edit a sentence.
                  Sized from what is in it so a short list stays compact.
                */
                rows={Math.min(4, Math.max(1, Math.ceil(o.text.length / 70)))}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, text: e.target.value } : p
                    )
                  )
                }
                className="min-w-0 flex-1 resize-y rounded-card border border-line bg-raised px-3 py-1.5 text-sm leading-relaxed"
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
          dismissed briefly. Used for single-best-answer questions; an
          EMQ leaves this empty and shows the working below instead.
        </span>
      </label>

      <fieldset className="mt-4">
        {/*
          Not admin-only, which is what this said. When the paragraph
          above is empty the card falls back to this working, and an EMQ
          always does — so on an EMQ the answer's entry here is the whole
          of what the candidate reads. Labelled as such, because a
          reviewer correcting candidate-facing wording was being pointed
          at the wrong box.
        */}
        <legend className="text-sm font-medium">
          Working for each option — the answer&rsquo;s entry is what an EMQ
          candidate reads
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
