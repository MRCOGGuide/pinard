"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { QuestionEditForm } from "@/components/QuestionEditForm";
import { groupIntoItems, itemIds, type QuestionItem } from "@/lib/emq";
import type { PassageMap, PendingQuestion } from "./page";
import { approveQuestions, rejectQuestions, updateQuestion } from "./actions";

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

  // Review by item, not by row: an EMQ set is one unit of work.
  const visible = useMemo(() => {
    const rows =
      formatFilter === "all"
        ? questions
        : questions.filter((q) => q.format === formatFilter);
    return groupIntoItems(rows);
  }, [questions, formatFilter]);

  const current: QuestionItem<PendingQuestion> | undefined = visible[cursor];
  // Editing acts on a single row; for a set that is its first scenario.
  const editTarget =
    current?.kind === "single" ? current.question : current?.scenarios[0];

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
        act(() => approveQuestions(itemIds(current)));
      } else if (k === "r") {
        e.preventDefault();
        act(() => rejectQuestions(itemIds(current)));
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

  const sbaCount = questions.filter((q) => q.format === "sba").length;
  const emqSetCount = new Set(
    questions.filter((q) => q.format === "emq").map((q) => q.emq_group_id ?? `q${q.id}`)
  ).size;

  const formatTabs = (
    <span className="flex items-center gap-1">
      {(
        [
          { value: "all", label: `All (${sbaCount + emqSetCount})` },
          { value: "sba", label: `SBA (${sbaCount})` },
          { value: "emq", label: `EMQ (${emqSetCount} sets)` },
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
          {current.kind === "emq_set" ? "EMQ set" : "Question"} {cursor + 1} of{" "}
          {visible.length}
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

      {editing && editTarget ? (
        <QuestionEditForm
          initial={{
            stem: editTarget.stem,
            options: editTarget.options,
            correct_key: editTarget.correct_key,
            explanation: editTarget.explanation ?? "",
            explanations: editTarget.explanations.map((e) => ({
              key: e.key,
              verdict: e.verdict,
              text: e.text,
              citation_chunk_ids: e.citation_chunk_ids,
              source_reference: e.source_reference,
            })),
          }}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            const result = await updateQuestion(editTarget.id, input);
            if (!result.error) setEditing(false);
            return result;
          }}
        />
      ) : current.kind === "emq_set" ? (
        <EmqSetCard item={current} passages={passages} />
      ) : (
        <QuestionCard question={current.question} passages={passages} />
      )}

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {!editing && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => approveQuestions(itemIds(current)))}
            className="rounded-card bg-greentop px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-theatre disabled:opacity-60"
          >
            {current.kind === "emq_set"
              ? `Approve set (${current.scenarios.length})`
              : "Approve"}{" "}
            <kbd className="ml-1 font-mono text-xs opacity-70">A</kbd>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre disabled:opacity-60"
          >
            {current.kind === "emq_set" ? "Edit scenario 1" : "Edit"}{" "}
            <kbd className="ml-1 font-mono text-xs opacity-70">E</kbd>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => rejectQuestions(itemIds(current)))}
            className="rounded-card border border-heartbeat/50 bg-porcelain px-5 py-2.5 text-sm font-medium text-heartbeat hover:bg-heartbeat hover:text-porcelain disabled:opacity-60"
          >
            {current.kind === "emq_set" ? "Reject set" : "Reject"}{" "}
            <kbd className="ml-1 font-mono text-xs opacity-70">R</kbd>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A whole EMQ set, laid out the way the exam presents it: the lead-in
 * naming the theme, then the shared option list, then every scenario
 * beneath it. The option list comes first because every lead-in refers
 * to "the list above" — showing it under a single stem was what made
 * generated sets read as SBAs.
 */
function EmqSetCard({
  item,
  passages,
}: {
  item: Extract<QuestionItem<PendingQuestion>, { kind: "emq_set" }>;
  passages: PassageMap;
}) {
  const first = item.scenarios[0];
  const answers = new Set(item.scenarios.map((s) => s.correct_key));

  return (
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          emq set
        </span>
        <span className="font-mono text-[11px] text-greentop">
          {item.options.length} options · {item.scenarios.length} scenarios
        </span>
        <span className="text-graphite/60">
          {first.sections?.title ?? "Unassigned"}
        </span>
        {first.difficulty && (
          <span className="font-mono text-graphite/50">
            difficulty {first.difficulty}/5
          </span>
        )}
        <span className="font-mono text-graphite/45">
          generated{" "}
          {new Date(first.created_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>

      {item.leadIn && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-graphite/80">
          {item.leadIn}
        </p>
      )}

      <ol className="mt-4 space-y-1.5 rounded-card border border-hairline bg-white/60 p-4">
        {item.options.map((o) => {
          const used = answers.has(o.key);
          return (
            <li
              key={o.key}
              className={`flex gap-2 text-sm ${
                used ? "font-medium text-greentop" : "text-graphite/85"
              }`}
            >
              <span className="font-mono text-xs leading-5">{o.key}</span>
              <span>
                {o.text}
                {used && <span aria-hidden> ✓</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[11px] text-graphite/50">
        ✓ marks an option used as an answer in this set. Distractors are
        expected to go unused.
      </p>

      <div className="mt-5 space-y-5">
        {item.scenarios.map((s, n) => (
          <ScenarioBlock
            key={s.id}
            scenario={s}
            position={n + 1}
            total={item.scenarios.length}
            passages={passages}
          />
        ))}
      </div>
    </article>
  );
}

/** One scenario inside a set: stem, its answer, and its explanations. */
function ScenarioBlock({
  scenario,
  position,
  total,
  passages,
}: {
  scenario: PendingQuestion;
  position: number;
  total: number;
  passages: PassageMap;
}) {
  return (
    <div className="border-t border-hairline pt-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
        Scenario {position} of {total} · answer {scenario.correct_key}
      </p>
      <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
        {scenario.stem}
      </p>
      <Explanations question={scenario} passages={passages} />
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
  return (
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          {question.format}
        </span>
        {question.format === "emq" && (
          <span
            title="Stored as an EMQ but has no sibling scenarios, so it cannot be shown as a set"
            className="rounded-full bg-heartbeat/10 px-2 py-0.5 font-mono text-[10px] text-heartbeat"
          >
            orphan scenario
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

      <Explanations question={question} passages={passages} />
    </article>
  );
}

/**
 * Per-option explanations with click-through to the source passage.
 * Shared by the single-question card and each scenario of an EMQ set,
 * so citations behave identically wherever they are read.
 */
function Explanations({
  question,
  passages,
}: {
  question: PendingQuestion;
  passages: PassageMap;
}) {
  const [openCite, setOpenCite] = useState<number | null>(null);

  return (
    <>
      {question.explanation && (
        <div className="mt-4 rounded-card border border-hairline bg-white/60 p-3">
          <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
            Shown on the card
          </p>
          <p className="mt-1 text-sm leading-relaxed text-graphite/85">
            {question.explanation}
          </p>
        </div>
      )}

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
    </>
  );
}

