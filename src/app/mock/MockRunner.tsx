"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitMockPaper } from "./actions";
import { groupIntoItems, itemIds, type QuestionItem } from "@/lib/emq";
import {
  formatClock,
  markPaper,
  paperSeconds,
  sbaAdviceSeconds,
  type MarkedPaper,
  type PaperShape,
} from "@/lib/mock";
import { formatReference } from "@/lib/reference";
import type { SessionQuestion } from "@/lib/session";

/**
 * Sitting a paper, rather than practising.
 *
 * Three things separate this from the daily session, and all three are
 * the point of it:
 *
 *   1. Nothing is marked until the paper is handed in. No answer is
 *      even sent — a verdict on the wire is a verdict the page could
 *      show, and a candidate who knows they got question 3 wrong is no
 *      longer sitting an exam.
 *
 *   2. It runs to a clock, and the clock does not stop. Time out and
 *      the paper is submitted as it stands, which is what happens in
 *      the hall.
 *
 *   3. Every question can be returned to. The real paper allows it, and
 *      a candidate who cannot go back learns to guess rather than to
 *      flag and move on.
 *
 * The SBAs come first and the EMQ sets after, in paper order, and the
 * RCOG's recommendation to move on at the SBA time is offered when the
 * moment arrives rather than enforced.
 */

type Phase = "brief" | "sitting" | "marked";

export function MockRunner({
  questions,
  passMark,
  fullPaper,
}: {
  questions: SessionQuestion[];
  passMark: number;
  fullPaper: PaperShape;
}) {
  // SBAs first, then whole EMQ sets — the order of the paper.
  const items = useMemo(() => {
    const grouped = groupIntoItems(questions);
    return [
      ...grouped.filter((i) => i.kind !== "emq_set"),
      ...grouped.filter((i) => i.kind === "emq_set"),
    ];
  }, [questions]);

  const shape: PaperShape = useMemo(
    () => ({
      sba: questions.filter((q) => q.format === "sba").length,
      emq: questions.filter((q) => q.format === "emq").length,
    }),
    [questions]
  );

  const totalSeconds = useMemo(() => paperSeconds(shape), [shape]);
  const adviceAt = useMemo(() => sbaAdviceSeconds(shape), [shape]);

  const [phase, setPhase] = useState<Phase>("brief");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(totalSeconds);
  const [marked, setMarked] = useState<MarkedPaper | null>(null);
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());
  const [adviceSeen, setAdviceSeen] = useState(false);
  /**
   * Flagged for review, by item.
   *
   * Not the flag on a question card, which is stored and follows the
   * question into later practice. This one lives and dies with the
   * paper: it means "come back to this before I hand in", and once the
   * paper is handed in there is nothing to come back to.
   */
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useRef(crypto.randomUUID());
  const submittedRef = useRef(false);

  const answeredCount = Object.keys(answers).length;

  const firstSba = items.findIndex((i) => i.kind !== "emq_set");
  const firstEmqIndex = items.findIndex((i) => i.kind === "emq_set");
  const flaggedIndexes = items
    .map((it, i) => (flags.has(it.key) ? i : -1))
    .filter((i) => i >= 0);
  const unansweredCount = items.filter((it) =>
    itemIds(it).some((id) => !answers[id])
  ).length;

  function toggleFlag(key: string) {
    setFlags((f) => {
      const next = new Set(f);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** The next flagged item after this one, wrapping to the first. */
  function goToNextFlagged() {
    if (flaggedIndexes.length === 0) return;
    const next = flaggedIndexes.find((i) => i > index) ?? flaggedIndexes[0];
    setIndex(next);
  }

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);

    const payload = Object.entries(answers).map(([id, key]) => ({
      questionId: Number(id),
      chosenKey: key,
    }));

    const outcome = await submitMockPaper({
      sessionId: sessionId.current,
      secondsTaken: totalSeconds - left,
      answers: payload,
    });

    if (outcome.error) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(outcome.error);
      return;
    }

    const correct = new Set(
      (outcome.results ?? []).filter((r) => r.is_correct).map((r) => r.questionId)
    );
    // Unanswered questions are wrong, as they are in the hall.
    const wrong = new Set(
      questions.map((q) => q.id).filter((id) => !correct.has(id))
    );

    setWrongIds(wrong);
    setMarked(
      markPaper({
        sbaCorrect: questions.filter(
          (q) => q.format === "sba" && correct.has(q.id)
        ).length,
        sbaTotal: shape.sba,
        emqCorrect: questions.filter(
          (q) => q.format === "emq" && correct.has(q.id)
        ).length,
        emqTotal: shape.emq,
        passMark,
      })
    );
    setSubmitting(false);
    setPhase("marked");
  }, [answers, left, passMark, questions, shape, totalSeconds]);

  // The clock. It runs on wall time rather than counting ticks, so a
  // backgrounded tab that stops firing intervals does not gain minutes.
  useEffect(() => {
    if (phase !== "sitting") return;
    const endsAt = Date.now() + left * 1000;
    const id = window.setInterval(() => {
      const remaining = Math.round((endsAt - Date.now()) / 1000);
      setLeft(remaining > 0 ? remaining : 0);
      if (remaining <= 0) {
        window.clearInterval(id);
        void submit();
      }
    }, 1000);
    return () => window.clearInterval(id);
    // `left` is deliberately not a dependency: re-running on every tick
    // would reset the end time each second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, submit]);

  // Leaving mid-paper loses it, so say so.
  useEffect(() => {
    if (phase !== "sitting") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const elapsed = totalSeconds - left;
  const showAdvice =
    phase === "sitting" &&
    adviceAt !== null &&
    elapsed >= adviceAt &&
    !adviceSeen &&
    items[index]?.kind !== "emq_set";

  /* ---------------------------------------------------------------- */

  if (phase === "brief") {
    return (
      <MockBrief
        shape={shape}
        fullPaper={fullPaper}
        totalSeconds={totalSeconds}
        adviceAt={adviceAt}
        passMark={passMark}
        onStart={() => setPhase("sitting")}
      />
    );
  }

  if (phase === "marked" && marked) {
    return (
      <MockResults
        marked={marked}
        items={items}
        answers={answers}
        wrongIds={wrongIds}
      />
    );
  }

  const item = items[index];

  return (
    <div>
      {/* The clock stays put while the paper scrolls under it. */}
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-hairline bg-sage/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-question items-center justify-between gap-3">
          <span className="font-mono text-sm text-graphite/70">
            {answeredCount} / {questions.length} answered
          </span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums ${
              left <= 300 ? "text-heartbeat" : "text-theatre"
            }`}
            aria-live="off"
          >
            {formatClock(left)}
          </span>
        </div>
      </div>

      {/* Moving between the two halves of the paper, and back to what
          was set aside. The exam is sat in two passes by most people:
          the SBAs, then the EMQs, then whatever was flagged. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-card border border-hairline">
          <button
            type="button"
            disabled={firstSba < 0}
            onClick={() => setIndex(firstSba)}
            className={`px-3 py-1.5 text-sm ${
              item.kind !== "emq_set"
                ? "bg-theatre text-porcelain"
                : "bg-porcelain text-graphite/75 hover:text-theatre"
            } disabled:opacity-40`}
          >
            SBAs · {shape.sba}
          </button>
          <button
            type="button"
            disabled={firstEmqIndex < 0}
            onClick={() => setIndex(firstEmqIndex)}
            className={`border-l border-hairline px-3 py-1.5 text-sm ${
              item.kind === "emq_set"
                ? "bg-theatre text-porcelain"
                : "bg-porcelain text-graphite/75 hover:text-theatre"
            } disabled:opacity-40`}
          >
            EMQs · {shape.emq}
          </button>
        </div>

        <button
          type="button"
          disabled={flaggedIndexes.length === 0}
          onClick={goToNextFlagged}
          className="rounded-card border border-amber/60 bg-porcelain px-3 py-1.5 text-sm text-amber hover:bg-amber/10 disabled:border-hairline disabled:text-graphite/40"
        >
          Flagged · {flaggedIndexes.length}
        </button>
      </div>

      {showAdvice && (
        <div className="mb-4 rounded-card border border-amber/50 bg-white p-4">
          <p className="text-sm text-graphite/85">
            You have used the {Math.round((adviceAt ?? 0) / 60)} minutes the
            RCOG recommends for the SBAs. Its advice is to move to the EMQs now
            and come back to any unfinished SBAs afterwards.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {firstEmqIndex >= 0 && (
              <button
                type="button"
                onClick={() => {
                  setIndex(firstEmqIndex);
                  setAdviceSeen(true);
                }}
                className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
              >
                Go to the EMQs
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdviceSeen(true)}
              className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
            >
              Keep going
            </button>
          </div>
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => toggleFlag(item.key)}
          aria-pressed={flags.has(item.key)}
          className={`rounded-card border px-3 py-1.5 text-sm ${
            flags.has(item.key)
              ? "border-amber bg-amber/10 text-amber"
              : "border-hairline bg-porcelain text-graphite/60 hover:text-theatre"
          }`}
        >
          {flags.has(item.key) ? "Flagged for review" : "Flag for review"}
        </button>
      </div>

      <PaperItem
        item={item}
        answers={answers}
        onAnswer={(id, key) => setAnswers((a) => ({ ...a, [id]: key }))}
      />

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="rounded-card border border-hairline bg-porcelain px-4 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={index >= items.length - 1}
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            if (!confirming && (flaggedIndexes.length > 0 || unansweredCount > 0)) {
              setConfirming(true);
              return;
            }
            void submit();
          }}
          className="ml-auto rounded-card border border-heartbeat/50 bg-porcelain px-4 py-2.5 text-sm font-medium text-heartbeat hover:bg-heartbeat/10 disabled:opacity-50"
        >
          {submitting ? "Marking…" : "Finish and mark"}
        </button>
      </div>

      {/* Handing in with questions flagged or blank is allowed — it is
          allowed in the hall — but not by accident. */}
      {confirming && !submitting && (
        <div className="mt-3 rounded-card border border-heartbeat/50 bg-white p-4">
          <p className="text-sm text-graphite/85">
            {unansweredCount > 0 && (
              <>
                {unansweredCount}{" "}
                {unansweredCount === 1 ? "question is" : "questions are"} not
                fully answered
                {flaggedIndexes.length > 0 ? ", and " : ". "}
              </>
            )}
            {flaggedIndexes.length > 0 && (
              <>
                {flaggedIndexes.length} flagged for review.{" "}
              </>
            )}
            Unanswered questions are marked wrong.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {flaggedIndexes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  goToNextFlagged();
                }}
                className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
              >
                Go to a flagged question
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-card border border-hairline bg-porcelain px-4 py-2 text-sm font-medium text-graphite/70 hover:text-theatre"
            >
              Keep working
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded-card border border-heartbeat/50 bg-porcelain px-4 py-2 text-sm font-medium text-heartbeat hover:bg-heartbeat/10"
            >
              Hand it in anyway
            </button>
          </div>
        </div>
      )}

      <Navigator
        items={items}
        answers={answers}
        flags={flags}
        current={index}
        onGo={setIndex}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MockBrief({
  shape,
  fullPaper,
  totalSeconds,
  adviceAt,
  passMark,
  onStart,
}: {
  shape: PaperShape;
  fullPaper: PaperShape;
  totalSeconds: number;
  adviceAt: number | null;
  passMark: number;
  onStart: () => void;
}) {
  const short = shape.sba < fullPaper.sba || shape.emq < fullPaper.emq;
  return (
    <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
      <h1 className="font-display text-2xl font-semibold text-theatre">
        Mock exam
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-graphite/80">
        {shape.sba} SBAs and {shape.emq} EMQs, in{" "}
        {Math.round(totalSeconds / 60)} minutes. Nothing is marked until you
        hand the paper in, and you can return to any question until then.
      </p>

      <ul className="mt-4 space-y-1.5 text-sm text-graphite/80">
        <li>
          · SBAs carry 40% of the marks and EMQs 60%, as in the real paper.
        </li>
        {adviceAt !== null && (
          <li>
            · The RCOG recommends {Math.round(adviceAt / 60)} minutes for the SBAs.
            The paper will say when you reach it.
          </li>
        )}
        <li>· {passMark}% or above is a pass here.</li>
        <li>
          · Flag anything you want to come back to, and move between the SBAs
          and the EMQs whenever you like.
        </li>
        <li>· When the time runs out the paper is submitted as it stands.</li>
      </ul>

      {short && (
        <p className="mt-4 rounded-card border border-amber/50 bg-white p-3 text-sm text-graphite/80">
          A full paper is {fullPaper.sba} SBAs and {fullPaper.emq} EMQs. The
          bank cannot fill one yet, so this is a shortened paper — marked and
          timed on the same scale, but not the same length.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onStart}
          className="rounded-card bg-theatre px-6 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Start the clock
        </button>
        <Link
          href="/"
          className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
        >
          Not now
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** One SBA, or one whole EMQ set, with no hint of whether it is right. */
function PaperItem({
  item,
  answers,
  onAnswer,
}: {
  item: QuestionItem<SessionQuestion>;
  answers: Record<number, string>;
  onAnswer: (questionId: number, key: string) => void;
}) {
  if (item.kind === "emq_set") {
    return (
      <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
          EMQ · {item.scenarios.length} scenarios · one option list
        </p>
        {item.leadIn && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-graphite/80">
            {item.leadIn}
          </p>
        )}
        <ol className="mt-4 space-y-1 rounded-card border border-hairline bg-white/60 p-4">
          {item.options.map((o) => (
            <li key={o.key} className="flex gap-2.5 text-sm text-graphite/85">
              <span className="font-mono text-xs leading-5 text-graphite/55">
                {o.key}
              </span>
              <span>{o.text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 space-y-5">
          {item.scenarios.map((s, n) => (
            <div key={s.id} className="border-t border-hairline pt-4">
              <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
                Scenario {n + 1} of {item.scenarios.length}
              </p>
              <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
                {s.stem}
              </p>
              <label htmlFor={`mock-${s.id}`} className="sr-only">
                Answer for scenario {n + 1}
              </label>
              <select
                id={`mock-${s.id}`}
                value={answers[s.id] ?? ""}
                onChange={(e) => onAnswer(s.id, e.target.value)}
                className="mt-3 w-full rounded-card border border-hairline bg-white px-3 py-2.5 text-sm text-graphite focus:border-greentop focus:outline-none focus:ring-1 focus:ring-greentop"
              >
                <option value="" disabled>
                  Choose from the list above…
                </option>
                {s.options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.key}. {o.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </article>
    );
  }

  const q = item.question;
  return (
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
      <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
        SBA
      </p>
      <p className="mt-3 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
        {q.stem}
      </p>
      <ul className="mt-5 space-y-2">
        {q.options.map((o) => {
          const chosen = answers[q.id] === o.key;
          return (
            <li key={o.key}>
              <button
                type="button"
                onClick={() => onAnswer(q.id, o.key)}
                className={`flex w-full gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors ${
                  chosen
                    ? "border-greentop bg-sage"
                    : "border-hairline bg-white hover:border-greentop hover:bg-sage"
                }`}
              >
                <span className="font-mono text-xs leading-5 text-graphite/60">
                  {o.key}
                </span>
                <span className="text-graphite">{o.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/* ------------------------------------------------------------------ */

/** Every question at a glance, so nothing is left behind by accident. */
function Navigator({
  items,
  answers,
  flags,
  current,
  onGo,
}: {
  items: QuestionItem<SessionQuestion>[];
  answers: Record<number, string>;
  flags: Set<string>;
  current: number;
  onGo: (index: number) => void;
}) {
  return (
    <div className="mt-6 rounded-card border border-hairline bg-porcelain p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
        Paper
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it, i) => {
          const ids = itemIds(it);
          const done = ids.every((id) => answers[id]);
          const part = ids.some((id) => answers[id]);
          const flagged = flags.has(it.key);
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onGo(i)}
              aria-current={i === current ? "true" : undefined}
              title={`${it.kind === "emq_set" ? `EMQ set of ${ids.length}` : "SBA"}${flagged ? " · flagged" : ""}`}
              // A flag outranks the answered colour: it is the thing the
              // candidate asked to be reminded of.
              className={`relative h-7 min-w-7 rounded border px-1.5 font-mono text-[11px] ${
                i === current
                  ? "border-theatre bg-theatre text-porcelain"
                  : flagged
                    ? "border-amber bg-amber/15 text-amber"
                    : done
                      ? "border-greentop bg-sage text-greentop"
                      : part
                        ? "border-amber/50 bg-white text-amber"
                        : "border-hairline bg-white text-graphite/50"
              }`}
            >
              {i + 1}
              {it.kind === "emq_set" ? "*" : ""}
              {flagged && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber"
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[11px] text-graphite/45">
        * an EMQ set · green answered · amber flagged · grey untouched
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MockResults({
  marked,
  items,
  answers,
  wrongIds,
}: {
  marked: MarkedPaper;
  items: QuestionItem<SessionQuestion>[];
  answers: Record<number, string>;
  wrongIds: Set<number>;
}) {
  return (
    <div>
      <div
        className={`rounded-card border p-6 text-center shadow-card ${
          marked.passed
            ? "border-greentop bg-sage"
            : "border-heartbeat bg-heartbeat/10"
        }`}
      >
        <p className="font-mono text-sm uppercase tracking-wide text-graphite/60">
          Mock exam
        </p>
        <p
          className={`mt-1 font-display text-4xl font-semibold ${
            marked.passed ? "text-greentop" : "text-heartbeat"
          }`}
        >
          {marked.passed ? "Pass" : "Fail"}
        </p>
        <p className="mt-2 font-display text-2xl font-semibold text-theatre">
          {marked.percent}%
        </p>
        <p className="mt-1 text-sm text-graphite/70">
          Pass mark {marked.passMark}%
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-1 font-mono text-sm text-graphite/70">
          <span>
            SBA {marked.sbaCorrect}/{marked.sbaTotal} · 40% of the mark
          </span>
          <span>
            EMQ {marked.emqCorrect}/{marked.emqTotal} · 60% of the mark
          </span>
        </div>
      </div>

      <h2 className="mt-8 font-display text-lg font-semibold text-theatre">
        Every question, with its answer
      </h2>

      <div className="mt-4 space-y-4">
        {items.map((item) =>
          item.kind === "emq_set" ? (
            <article
              key={item.key}
              className="rounded-card border border-hairline bg-porcelain p-5 shadow-card"
            >
              <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
                EMQ set
              </p>
              {item.leadIn && (
                <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                  {item.leadIn}
                </p>
              )}
              {item.scenarios.map((s, n) => (
                <Reviewed
                  key={s.id}
                  question={s}
                  label={`Scenario ${n + 1}`}
                  chosen={answers[s.id] ?? null}
                  wrong={wrongIds.has(s.id)}
                />
              ))}
            </article>
          ) : (
            <article
              key={item.key}
              className="rounded-card border border-hairline bg-porcelain p-5 shadow-card"
            >
              <Reviewed
                question={item.question}
                label="SBA"
                chosen={answers[item.question.id] ?? null}
                wrong={wrongIds.has(item.question.id)}
              />
            </article>
          )
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link
          href="/progress"
          className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          See your progress
        </Link>
        <Link
          href="/mock"
          className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
        >
          Another paper
        </Link>
      </div>
    </div>
  );
}

/** One question after the paper: what was chosen, what was right, why. */
function Reviewed({
  question,
  label,
  chosen,
  wrong,
}: {
  question: SessionQuestion;
  label: string;
  chosen: string | null;
  wrong: boolean;
}) {
  const correct = question.options.find((o) => o.key === question.correct_key);
  const picked = question.options.find((o) => o.key === chosen);
  const explanation =
    question.explanation?.trim() ||
    question.explanations
      .filter((e) => e.key === question.correct_key)
      .map((e) => e.text)
      .join(" ");

  return (
    <div className="mt-4 border-t border-hairline pt-4 first:mt-0 first:border-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-greentop">
          {label}
        </span>
        <span
          className={`font-mono text-[11px] uppercase tracking-wide ${
            wrong ? "text-heartbeat" : "text-greentop"
          }`}
        >
          {wrong ? (chosen ? "incorrect" : "not answered") : "correct"}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-graphite">
        {question.stem}
      </p>

      <p className="mt-3 rounded-card border border-greentop bg-sage px-3 py-2 text-sm">
        <span className="font-mono text-xs text-graphite/60">Answer</span>{" "}
        <span className="font-mono text-xs">{correct?.key}</span>{" "}
        {correct?.text}
      </p>
      {wrong && chosen && (
        <p className="mt-1.5 rounded-card border border-heartbeat/50 bg-heartbeat/10 px-3 py-2 text-sm">
          <span className="font-mono text-xs text-graphite/60">You chose</span>{" "}
          <span className="font-mono text-xs">{picked?.key}</span>{" "}
          {picked?.text}
        </p>
      )}

      {explanation && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-graphite/85">
          {explanation}
        </p>
      )}

      {question.sources.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {question.sources.map((s, i) => (
            <li key={i} className="text-[11px] text-graphite/55">
              <span className="font-medium text-graphite/70">{s.title}</span>
              {formatReference(s) && <span> · {formatReference(s)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
