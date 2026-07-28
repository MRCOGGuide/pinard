"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { QuestionOption } from "@/lib/types";
import type { PassageMap, PendingQuestion } from "./page";
import {
  approveQuestion,
  rejectQuestion,
  updateQuestion,
  type ExplanationEdit,
} from "./actions";

export function ReviewQueue({
  questions,
  passages,
}: {
  questions: PendingQuestion[];
  passages: PassageMap;
}) {
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current = questions[cursor];

  const act = useCallback(
    (fn: () => Promise<{ error?: string }>) => {
      startTransition(async () => {
        const result = await fn();
        if (result.error) setError(result.error);
        else setError(null);
        // Revalidation reloads the list; keep the cursor in range.
        setCursor((c) => Math.max(0, Math.min(c, questions.length - 2)));
      });
    },
    [questions.length]
  );

  // Keyboard shortcuts A / E / R (ignored while typing or editing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing || pending || !current) return;
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "a") {
        e.preventDefault();
        act(() => approveQuestion(current.id));
      } else if (k === "r") {
        e.preventDefault();
        act(() => rejectQuestion(current.id));
      } else if (k === "e") {
        e.preventDefault();
        setEditing(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, pending, current, act]);

  if (questions.length === 0) {
    return (
      <p className="rounded-card border border-hairline bg-porcelain p-5 text-sm text-graphite/60">
        Nothing to review. Generate some questions in the console, and they will
        queue here.
      </p>
    );
  }

  if (!current) {
    return (
      <p className="rounded-card border border-hairline bg-porcelain p-5 text-sm text-greentop">
        All caught up — every pending question has been reviewed.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-graphite/60">
        <span>
          Question {cursor + 1} of {questions.length}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            disabled={cursor === 0}
            className="rounded px-2 py-1 hover:text-theatre disabled:opacity-30"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() =>
              setCursor((c) => Math.min(questions.length - 1, c + 1))
            }
            disabled={cursor >= questions.length - 1}
            className="rounded px-2 py-1 hover:text-theatre disabled:opacity-30"
          >
            Next →
          </button>
        </span>
      </div>

      {editing ? (
        <EditForm
          question={current}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <QuestionCard question={current} passages={passages} />
      )}

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {!editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => approveQuestion(current.id))}
            className="rounded-card bg-greentop px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-theatre disabled:opacity-60"
          >
            Approve <kbd className="ml-1 font-mono text-xs opacity-70">A</kbd>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre disabled:opacity-60"
          >
            Edit <kbd className="ml-1 font-mono text-xs opacity-70">E</kbd>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => rejectQuestion(current.id))}
            className="rounded-card border border-heartbeat/50 bg-porcelain px-5 py-2.5 text-sm font-medium text-heartbeat hover:bg-heartbeat hover:text-porcelain disabled:opacity-60"
          >
            Reject <kbd className="ml-1 font-mono text-xs opacity-70">R</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  passages,
}: {
  question: PendingQuestion;
  passages: PassageMap;
}) {
  const [openCite, setOpenCite] = useState<number | null>(null);

  return (
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          {question.format}
        </span>
        <span className="text-graphite/60">
          {question.sections?.title ?? "Unassigned"}
        </span>
        {question.difficulty && (
          <span className="font-mono text-graphite/50">
            difficulty {question.difficulty}/5
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
        {question.stem}
      </p>

      <ol className="mt-4 space-y-1.5">
        {question.options.map((o) => {
          const correct = o.key === question.correct_key;
          return (
            <li
              key={o.key}
              className={`flex gap-2 text-sm ${
                correct ? "font-medium text-greentop" : "text-graphite/85"
              }`}
            >
              <span className="font-mono text-xs leading-5">{o.key}</span>
              <span>
                {o.text}
                {correct && <span aria-hidden> ✓</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-y-2 border-t border-hairline pt-3">
        {question.explanations.map((e) => (
          <div key={e.key} className="text-sm">
            <span
              className={`font-mono text-xs ${
                e.verdict === "correct" ? "text-greentop" : "text-graphite/50"
              }`}
            >
              {e.key} {e.verdict === "correct" ? "✓" : "✗"}
            </span>{" "}
            <span className="text-graphite/85">{e.text}</span>{" "}
            {e.source_reference && (
              <span className="font-mono text-[11px] text-graphite/50">
                ({e.source_reference}){" "}
              </span>
            )}
            {e.citation_chunk_ids.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setOpenCite(openCite === id ? null : id)}
                className="ml-0.5 rounded bg-sage px-1.5 py-0.5 font-mono text-[11px] text-greentop hover:bg-greentop hover:text-porcelain"
              >
                chunk:{id}
              </button>
            ))}
          </div>
        ))}
      </div>

      {openCite !== null && passages[openCite] && (
        <div className="mt-3 rounded-card border border-greentop/40 bg-white/70 p-3">
          <p className="font-mono text-[11px] text-graphite/60">
            chunk:{openCite} · {passages[openCite].document_title} ·{" "}
            {passages[openCite].source_reference}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite/90">
            {passages[openCite].text}
          </p>
        </div>
      )}
      {openCite !== null && !passages[openCite] && (
        <p className="mt-3 text-xs text-heartbeat">
          Source passage chunk:{openCite} could not be loaded (it may have been
          re-ingested since generation).
        </p>
      )}
    </article>
  );
}

function EditForm({
  question,
  onCancel,
  onSaved,
}: {
  question: PendingQuestion;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [stem, setStem] = useState(question.stem);
  const [options, setOptions] = useState<QuestionOption[]>(question.options);
  const [correctKey, setCorrectKey] = useState(question.correct_key);
  const [explanations, setExplanations] = useState<ExplanationEdit[]>(
    question.explanations.map((e) => ({
      key: e.key,
      verdict: e.verdict,
      text: e.text,
      citation_chunk_ids: e.citation_chunk_ids,
      source_reference: e.source_reference,
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateQuestion(question.id, {
        stem,
        options,
        correct_key: correctKey,
        explanations,
      });
      if (result.error) setError(result.error);
      else onSaved();
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
