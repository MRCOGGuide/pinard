"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QuestionEditForm } from "@/components/QuestionEditForm";
import type { PassageMap, PendingQuestion } from "./page";
import { approveQuestion, rejectQuestion, updateQuestion } from "./actions";

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
  const [jump, setJump] = useState("");
  const [formatFilter, setFormatFilter] = useState<"all" | "sba" | "emq">("all");

  const visible =
    formatFilter === "all"
      ? questions
      : questions.filter((q) => q.format === formatFilter);

  const current = visible[cursor];

  function filterBy(next: "all" | "sba" | "emq") {
    setFormatFilter(next);
    setCursor(0);
    setEditing(false);
  }

  function goTo() {
    const n = Number(jump);
    if (!Number.isFinite(n) || n < 1) return;
    setCursor(Math.min(visible.length, Math.round(n)) - 1);
    setJump("");
  }

  const act = useCallback(
    (fn: () => Promise<{ error?: string }>) => {
      startTransition(async () => {
        const result = await fn();
        if (result.error) setError(result.error);
        else setError(null);
        // Revalidation reloads the list; keep the cursor in range.
        setCursor((c) => Math.max(0, Math.min(c, visible.length - 2)));
      });
    },
    [visible.length]
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

  const formatTabs = (
    <span className="flex items-center gap-1">
      {(
        [
          { value: "all", label: `All (${questions.length})` },
          {
            value: "sba",
            label: `SBA (${questions.filter((q) => q.format === "sba").length})`,
          },
          {
            value: "emq",
            label: `EMQ (${questions.filter((q) => q.format === "emq").length})`,
          },
        ] as const
      ).map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => filterBy(tab.value)}
          className={`rounded-card border px-2.5 py-1 text-xs font-medium ${
            formatFilter === tab.value
              ? "border-theatre bg-theatre text-porcelain"
              : "border-hairline bg-porcelain text-graphite/70 hover:text-theatre"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </span>
  );

  if (!current) {
    return (
      <div>
        <div className="mb-3">{formatTabs}</div>
        <p className="rounded-card border border-hairline bg-porcelain p-5 text-sm text-greentop">
          {formatFilter === "all"
            ? "All caught up — every pending question has been reviewed."
            : `No pending ${formatFilter.toUpperCase()} questions.`}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">{formatTabs}</div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-graphite/60">
        <span>
          Question {cursor + 1} of {visible.length}
        </span>
        <span className="flex items-center gap-1">
          <label className="flex items-center gap-1.5">
            <span className="text-xs">Go to</span>
            <input
              type="number"
              min={1}
              max={visible.length}
              value={jump}
              onChange={(e) => setJump(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  goTo();
                }
              }}
              placeholder="№"
              className="w-16 rounded-card border border-hairline bg-white px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={goTo}
            disabled={!jump}
            className="rounded px-2 py-1 hover:text-theatre disabled:opacity-30"
          >
            Go
          </button>
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
              setCursor((c) => Math.min(visible.length - 1, c + 1))
            }
            disabled={cursor >= visible.length - 1}
            className="rounded px-2 py-1 hover:text-theatre disabled:opacity-30"
          >
            Next →
          </button>
        </span>
      </div>

      {editing ? (
        <QuestionEditForm
          initial={{
            stem: current.stem,
            options: current.options,
            correct_key: current.correct_key,
            explanations: current.explanations.map((e) => ({
              key: e.key,
              verdict: e.verdict,
              text: e.text,
              citation_chunk_ids: e.citation_chunk_ids,
              source_reference: e.source_reference,
            })),
          }}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            const result = await updateQuestion(current.id, input);
            if (!result.error) setEditing(false);
            return result;
          }}
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
        {question.emq_group_id && (
          <span
            title="One scenario of an EMQ set — the others share this option list"
            className="rounded-full bg-sage px-2 py-0.5 font-mono text-[10px] text-greentop"
          >
            set scenario
          </span>
        )}
        <span className="text-graphite/60">
          {question.sections?.title ?? "Unassigned"}
        </span>
        {question.difficulty && (
          <span className="font-mono text-graphite/50">
            difficulty {question.difficulty}/5
          </span>
        )}
        <span className="font-mono text-graphite/45">
          generated{" "}
          {new Date(question.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      {question.lead_in && (
        <p className="mt-3 whitespace-pre-wrap text-sm italic leading-relaxed text-graphite/75">
          {question.lead_in}
        </p>
      )}

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

