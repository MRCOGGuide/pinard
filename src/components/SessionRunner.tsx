"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import { groupIntoItems, itemSize, type QuestionItem } from "@/lib/emq";
import { formatReference } from "@/lib/reference";
import {
  getSimilarValues,
  recordAnswer,
  refreshProgressViews,
  toggleQuestionFlag,
  type SimilarValueGroup,
} from "@/app/session/actions";
import { AskPinard } from "@/components/AskPinard";
import { ExplanationTable } from "@/components/ExplanationTable";
import { PricingTable } from "@/components/PricingTable";
import type { TierPricing } from "@/lib/billing";

/**
 * Runs a session one *item* at a time. An item is a single SBA, or a
 * whole EMQ set presented the way the exam presents it: lead-in, then
 * the shared option list, then every scenario beneath it. Each scenario
 * is still answered and scored individually — a 4-scenario set counts
 * as 4 questions — but they are never split across screens, because a
 * scenario shown alone with its ten options is just an SBA.
 */

export function SessionRunner({
  questions,
  title,
  endCard = "default",
  prices,
  flaggedIds = [],
}: {
  questions: SessionQuestion[];
  title: string;
  endCard?: "default" | "paywall";
  prices?: TierPricing[];
  /** Ids this candidate has already flagged, so the button starts right. */
  flaggedIds?: number[];
}) {
  const sessionId = useRef(crypto.randomUUID());
  // A run is fixed the moment it starts. If the page re-renders with a
  // freshly drawn selection — a server action revalidating, a router
  // refresh — the candidate must not have the question under them
  // swapped for a different one at the same index.
  const [items] = useState(() => groupIntoItems(questions));
  const flagged = useMemo(() => new Set(flaggedIds), [flaggedIds]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const item = items[index];
  const finished = index >= items.length;
  const [keysOpen, setKeysOpen] = useState(false);

  useSessionKeys((event) => {
    if (event.key === "?") {
      event.preventDefault();
      setKeysOpen((o) => !o);
    } else if (event.key === "Escape") {
      setKeysOpen(false);
    }
  });

  // The free sampler is the one surface a candidate reaches without a
  // subscription, and the tutor chat is part of the subscription. The
  // server action enforces that too — this only keeps the box from
  // being offered where it would refuse.
  const chatEnabled = endCard !== "paywall";

  // Where this item sits in the run, counted in questions rather than
  // items, so "3 of 10" always means the same thing to a candidate.
  const answeredBefore = items
    .slice(0, index)
    .reduce((n, it) => n + itemSize(it), 0);

  // The run is over: let /practise and /progress rebuild, so the
  // coverage bars there reflect what was just answered.
  useEffect(() => {
    if (finished) void refreshProgressViews();
  }, [finished]);

  function advance(correctDelta: number) {
    setCorrectCount((c) => c + correctDelta);
    setIndex((i) => i + 1);
  }

  if (finished && endCard === "paywall") {
    return (
      <div>
        <div className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
          <p className="font-mono text-sm text-good">
            {correctCount} / {questions.length} on your free sample
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink-strong">
            Ready for the full syllabus?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink/70">
            The full plan adapts to your weakest topics, tracks every section
            toward the 70% threshold, and rebuilds daily sessions around your
            exam date.
          </p>
        </div>
        <div className="mt-5">
          <PricingTable prices={prices} />
        </div>
      </div>
    );
  }

  if (finished) {
    const pct = questions.length
      ? Math.round((correctCount / questions.length) * 100)
      : 0;
    return (
      <div className="rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <p className="font-mono text-sm text-good">Session complete</p>
        <p className="mt-2 font-display text-4xl font-semibold text-ink-strong">
          {correctCount} / {questions.length}
        </p>
        <p className="mt-1 font-mono text-sm text-ink/60">{pct}% correct</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/progress"
            className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            See your progress
          </Link>
          <Link
            href="/"
            className="rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Back to today
          </Link>
        </div>
      </div>
    );
  }

  const size = itemSize(item);
  const counter =
    size === 1
      ? `${answeredBefore + 1} / ${questions.length}`
      : `${answeredBefore + 1}–${answeredBefore + size} / ${questions.length}`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-ink/60">
        <span>{title}</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setKeysOpen(true)}
            className="font-mono text-[11px] text-ink/45 hover:text-ink-strong"
            title="Keyboard shortcuts"
          >
            ? keys
          </button>
          <span className="font-mono">{counter}</span>
        </span>
      </div>

      <ShortcutSheet open={keysOpen} onClose={() => setKeysOpen(false)} />

      {item.kind === "emq_set" ? (
        <EmqSetCard
          key={item.key}
          item={item}
          flagged={flagged}
          chatEnabled={chatEnabled}
          sessionId={sessionId.current}
          isLast={index + 1 >= items.length}
          onDone={advance}
        />
      ) : (
        <SingleCard
          key={item.key}
          question={item.question}
          flagged={flagged.has(item.question.id)}
          chatEnabled={chatEnabled}
          sessionId={sessionId.current}
          isLast={index + 1 >= items.length}
          onDone={advance}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Single question (SBA, or an EMQ scenario with no surviving set)     */
/* ------------------------------------------------------------------ */

function SingleCard({
  question,
  flagged,
  chatEnabled,
  sessionId,
  isLast,
  onDone,
}: {
  question: SessionQuestion;
  flagged: boolean;
  chatEnabled: boolean;
  sessionId: string;
  isLast: boolean;
  onDone: (correctDelta: number) => void;
}) {
  const startedAt = useRef(Date.now());
  const [chosen, setChosen] = useState<string | null>(null);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarValueGroup[] | null>(null);
  const flag = useFlag(question.id, flagged);
  const seconds = useElapsed(!revealed);

  /*
    Choosing and answering are two steps rather than one.

    They used to be the same click, which made ruling an option out
    impossible — every press was final — and gave a candidate no way to
    sit with a shortlist the way they will in the exam. Now A–E moves
    the selection and nothing is recorded until Enter.
  */
  function select(key: string) {
    if (revealed || saving) return;
    setChosen(key);
    // Choosing an option you had ruled out is a change of mind, not a
    // contradiction: the strike goes away rather than blocking it.
    setEliminated((out) => {
      if (!out.has(key)) return out;
      const next = new Set(out);
      next.delete(key);
      return next;
    });
  }

  function eliminate(key: string) {
    if (revealed || saving) return;
    setEliminated((out) => {
      const next = new Set(out);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // A struck option cannot stay selected.
    setChosen((c) => (c === key && !eliminated.has(key) ? null : c));
  }

  async function check() {
    if (revealed || saving || !chosen) return;
    setSaving(true);
    setError(null);
    const result = await recordAnswer({
      questionId: question.id,
      chosenKey: chosen,
      secondsTaken: (Date.now() - startedAt.current) / 1000,
      sessionId,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setWasCorrect(Boolean(result.is_correct));
    setRevealed(true);
    getSimilarValues(question.id)
      .then(setSimilar)
      .catch(() => setSimilar(null));
  }

  useSessionKeys((event) => {
    const letter = event.key.toUpperCase();
    if (letter === "F") {
      event.preventDefault();
      void flag.toggle();
      return;
    }
    if (revealed) {
      if (letter === "N" || event.key === "Enter") {
        event.preventDefault();
        onDone(wasCorrect ? 1 : 0);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void check();
      return;
    }
    if (question.options.some((o) => o.key === letter)) {
      event.preventDefault();
      if (event.shiftKey) eliminate(letter);
      else select(letter);
    }
  });

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2 py-0.5 font-mono uppercase text-ink/60">
          {question.format}
        </span>
        <span className="text-ink/60">{question.section_title}</span>
        <span className="ml-auto flex items-center gap-2">
          <Timer seconds={seconds} stopped={revealed} />
          <FlagButton flagged={flag.flagged} onToggle={flag.toggle} />
        </span>
      </div>

      {question.lead_in && (
        <p className="mt-3 text-sm italic text-ink/70">{question.lead_in}</p>
      )}
      <p className="mt-3 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-ink">
        {question.stem}
      </p>

      <OptionList
        question={question}
        chosen={chosen}
        eliminated={eliminated}
        revealed={revealed}
        disabled={saving}
        onChoose={select}
        onEliminate={eliminate}
      />

      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}

      {!revealed && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={check}
            disabled={!chosen || saving}
            className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
          >
            {saving ? "Saving…" : "Check answer"}
          </button>
          <button
            type="button"
            onClick={() => onDone(0)}
            disabled={saving}
            className="rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/70 hover:text-ink-strong disabled:opacity-50"
          >
            {isLast ? "Skip and finish" : "Skip question"}
          </button>
          <span className="font-mono text-[11px] text-ink/40">
            {chosen ? "Enter to check" : "A–E to choose"}
          </span>
        </div>
      )}

      {revealed && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-medium text-ink-strong">
            {wasCorrect
              ? "Correct."
              : `The correct answer is ${question.correct_key}.`}
          </p>
          <ExplanationList question={question} />
          <SimilarValues groups={similar} />
          <SourceList sources={question.sources} />
          {chatEnabled && <AskPinard questionId={question.id} />}
          <button
            type="button"
            onClick={() => onDone(wasCorrect ? 1 : 0)}
            className="mt-5 rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            {isLast ? "Finish session" : "Next question"}
          </button>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* EMQ set — lead-in, shared option list, then every scenario           */
/* ------------------------------------------------------------------ */

function EmqSetCard({
  item,
  flagged,
  chatEnabled,
  sessionId,
  isLast,
  onDone,
}: {
  item: Extract<QuestionItem<SessionQuestion>, { kind: "emq_set" }>;
  /** Flagging is per scenario: each one is answered and scored alone. */
  flagged: Set<number>;
  chatEnabled: boolean;
  sessionId: string;
  isLast: boolean;
  onDone: (correctDelta: number) => void;
}) {
  const startedAt = useRef(Date.now());
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<Record<number, SimilarValueGroup[]>>({});
  const seconds = useElapsed(!revealed);

  const answeredAll = item.scenarios.every((s) => answers[s.id]);

  // The scenarios are answered through their own selects, which take
  // their own keys; what is left for the set is submitting it and
  // moving on. Flagging stays on each scenario's own button, since F
  // could not say which of four it meant.
  useSessionKeys((event) => {
    if (revealed) {
      if (event.key.toUpperCase() === "N" || event.key === "Enter") {
        event.preventDefault();
        onDone(correctCount);
      }
      return;
    }
    if (event.key === "Enter" && answeredAll) {
      event.preventDefault();
      void submit();
    }
  });

  async function submit() {
    if (saving || revealed || !answeredAll) return;
    setSaving(true);
    setError(null);

    // Time is measured across the set, so share it between scenarios
    // rather than charging each one the whole reading time.
    const seconds =
      (Date.now() - startedAt.current) / 1000 / item.scenarios.length;

    const results = await Promise.all(
      item.scenarios.map((s) =>
        recordAnswer({
          questionId: s.id,
          chosenKey: answers[s.id],
          secondsTaken: seconds,
          sessionId,
        })
      )
    );
    setSaving(false);

    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error ?? "Could not save your answers");
      return;
    }

    setCorrectCount(results.filter((r) => r.is_correct).length);
    setRevealed(true);

    Promise.all(
      item.scenarios.map((s) =>
        getSimilarValues(s.id)
          .then((groups) => [s.id, groups] as const)
          .catch(() => [s.id, []] as const)
      )
    ).then((pairs) => setSimilar(Object.fromEntries(pairs)));
  }

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2 py-0.5 font-mono uppercase text-ink/60">
          emq set
        </span>
        <span className="font-mono text-[11px] text-good">
          {item.scenarios.length} scenarios · one option list
        </span>
        <span className="text-ink/60">
          {item.scenarios[0].section_title}
        </span>
        <span className="ml-auto">
          <Timer seconds={seconds} stopped={revealed} />
        </span>
      </div>

      {item.leadIn && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
          {item.leadIn}
        </p>
      )}

      {/* The option list sits above the scenarios: every lead-in tells
          the candidate to choose "from the list above". */}
      <ol className="mt-4 space-y-1 rounded-card border border-line bg-raised/60 p-4">
        {item.options.map((o) => (
          <li key={o.key} className="flex gap-2.5 text-sm text-ink/85">
            <span className="font-mono text-xs leading-5 text-ink/55">
              {o.key}
            </span>
            <span>{o.text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 space-y-5">
        {item.scenarios.map((s, n) => (
          <div key={s.id} className="border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wide text-good">
                Scenario {n + 1} of {item.scenarios.length}
              </p>
              <ScenarioFlag
                questionId={s.id}
                initiallyFlagged={flagged.has(s.id)}
                className="ml-auto"
              />
            </div>
            <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-ink">
              {s.stem}
            </p>

            <EmqAnswerSelect
              scenario={s}
              number={n + 1}
              chosen={answers[s.id] ?? null}
              revealed={revealed}
              disabled={saving}
              onChoose={(key) =>
                setAnswers((a) => (revealed ? a : { ...a, [s.id]: key }))
              }
            />

            {revealed && (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm font-medium text-ink-strong">
                  {answers[s.id] === s.correct_key
                    ? "Correct."
                    : `The correct answer is ${s.correct_key}.`}
                </p>
                <ExplanationList question={s} />
                <SimilarValues groups={similar[s.id] ?? null} />
                {chatEnabled && <AskPinard questionId={s.id} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}

      {!revealed ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!answeredAll || saving}
            className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
          >
            {saving
              ? "Saving…"
              : answeredAll
                ? "Submit set"
                : `Answer all ${item.scenarios.length} scenarios`}
          </button>
          <button
            type="button"
            onClick={() => onDone(0)}
            disabled={saving}
            className="rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/70 hover:text-ink-strong disabled:opacity-50"
          >
            {isLast ? "Skip and finish" : "Skip set"}
          </button>
        </div>
      ) : (
        <div className="mt-5 border-t border-line pt-4">
          <p className="font-mono text-sm text-good">
            {correctCount} / {item.scenarios.length} in this set
          </p>
          <SourceList sources={item.scenarios[0].sources} />
          <button
            type="button"
            onClick={() => onDone(correctCount)}
            className="mt-5 rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
          >
            {isLast ? "Finish session" : "Next question"}
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * One scenario's answer, chosen from the shared list.
 *
 * A set of five scenarios over twelve options meant sixty buttons on
 * one card, the same twelve repeated five times under a list that
 * already sits at the top. A select says the same thing in one line
 * and lets the whole set be read as a set, which is how the exam
 * presents it.
 *
 * Once answered it stops being a control: a disabled select showing
 * only what was picked hides whether that was right, so the choice and
 * the answer are spelled out instead.
 */
function EmqAnswerSelect({
  scenario,
  number,
  chosen,
  revealed,
  disabled,
  onChoose,
}: {
  scenario: SessionQuestion;
  number: number;
  chosen: string | null;
  revealed: boolean;
  disabled: boolean;
  onChoose: (key: string) => void;
}) {
  const id = `emq-answer-${scenario.id}`;
  const correct = scenario.options.find((o) => o.key === scenario.correct_key);

  if (revealed) {
    const picked = scenario.options.find((o) => o.key === chosen);
    const right = chosen === scenario.correct_key;
    return (
      <div className="mt-3 space-y-1.5 text-sm">
        <p
          className={`rounded-card border px-3 py-2 ${
            right
              ? "border-good bg-sunk text-ink"
              : "border-accent bg-accent/10 text-ink"
          }`}
        >
          <span className="font-mono text-xs text-ink/60">
            Your answer
          </span>{" "}
          <span className="font-mono text-xs">{picked?.key ?? "—"}</span>{" "}
          {picked?.text ?? "not answered"}
        </p>
        {!right && (
          <p className="rounded-card border border-good bg-sunk px-3 py-2">
            <span className="font-mono text-xs text-ink/60">Correct</span>{" "}
            <span className="font-mono text-xs">{correct?.key}</span>{" "}
            {correct?.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <label htmlFor={id} className="sr-only">
        Answer for scenario {number}
      </label>
      <select
        id={id}
        value={chosen ?? ""}
        disabled={disabled}
        onChange={(e) => onChoose(e.target.value)}
        className="w-full rounded-card border border-line bg-raised px-3 py-2.5 text-sm text-ink focus:border-good focus:outline-none focus:ring-1 focus:ring-good disabled:opacity-60"
      >
        <option value="" disabled>
          Choose from the list above…
        </option>
        {scenario.options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.key}. {o.text}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

/**
 * A session answered without the mouse: A–E to choose, Shift+A–E to
 * rule an option out, Enter to check, N for the next question, F to
 * flag, ? for the list.
 *
 * Bound to the document rather than to the card. The card holds no
 * focus when a question loads, and asking a candidate to click it
 * before the keys work would defeat the point of having them. Anything
 * typed into Ask Pinard or an EMQ select belongs to that field, so
 * those are handed back untouched.
 */
function useSessionKeys(handler: (event: KeyboardEvent) => void) {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // A browser or OS shortcut, not ours.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      latest.current(event);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

/** Seconds on the current question, stopping when it is answered. */
function useElapsed(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [running]);
  return seconds;
}

/** Time on this question. Counting up rather than down: a session is
 *  for learning, and a clock running out is the mock's job. */
function Timer({ seconds, stopped }: { seconds: number; stopped: boolean }) {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return (
    <span
      className={`font-mono text-[11px] tabular-nums ${stopped ? "text-ink/40" : "text-ink/55"}`}
      title="Time on this question"
    >
      {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}

const SHORTCUTS: [string, string][] = [
  ["A – E", "Choose an option"],
  ["Shift + A – E", "Rule an option out"],
  ["Enter", "Check your answer"],
  ["N", "Next question"],
  ["F", "Flag for review"],
  ["?", "This list"],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-graphite/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-card border border-line bg-surface p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
          Keyboard
        </p>
        <dl className="mt-3 space-y-2">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key} className="flex items-baseline gap-3">
              <dt className="w-28 shrink-0 font-mono text-[11px] text-ink-strong">
                {key}
              </dt>
              <dd className="text-sm text-ink/70">{what}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-card border border-line px-3 py-1.5 text-xs font-medium text-ink/70 hover:text-ink-strong"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function OptionList({
  question,
  chosen,
  eliminated,
  revealed,
  disabled,
  onChoose,
  onEliminate,
}: {
  question: SessionQuestion;
  chosen: string | null;
  eliminated: Set<string>;
  revealed: boolean;
  disabled: boolean;
  onChoose: (key: string) => void;
  onEliminate: (key: string) => void;
}) {
  return (
    <ul className="mt-5 space-y-2">
      {question.options.map((o) => {
        const isChosen = chosen === o.key;
        const isCorrect = o.key === question.correct_key;
        const isOut = !revealed && eliminated.has(o.key);
        let cls = "border-line bg-raised hover:border-good hover:bg-sunk";
        if (revealed) {
          if (isCorrect) cls = "border-good bg-sunk";
          else if (isChosen) cls = "border-accent bg-accent/10";
          else cls = "border-line bg-raised opacity-70";
        } else if (isOut) {
          cls = "border-line bg-raised";
        } else if (isChosen) {
          cls = "border-good bg-sunk";
        }
        return (
          <li key={o.key} className="flex items-stretch gap-1.5">
            <button
              type="button"
              disabled={revealed || disabled}
              // A struck option is put back by clicking it, so ruling
              // one out by mistake costs the same click to undo.
              onClick={() => (isOut ? onEliminate(o.key) : onChoose(o.key))}
              aria-pressed={isChosen}
              className={`flex min-w-0 flex-1 gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors ${cls}`}
            >
              <span
                className={`font-mono text-xs leading-5 ${isOut ? "text-ink/35" : "text-ink/60"}`}
              >
                {o.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className={isOut ? "text-ink/35 line-through" : "text-ink"}>
                  {o.text}
                </span>
                {revealed && (
                  <span
                    className={`mt-1 block font-mono text-[11px] uppercase tracking-wide ${
                      isCorrect
                        ? "text-good"
                        : isChosen
                          ? "text-accent-ink"
                          : "text-ink/45"
                    }`}
                  >
                    {isCorrect ? "Correct" : "Incorrect"}
                  </span>
                )}
              </span>
            </button>
            {!revealed && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onEliminate(o.key)}
                aria-pressed={isOut}
                title={
                  isOut
                    ? `Put ${o.key} back (Shift+${o.key})`
                    : `Rule ${o.key} out (Shift+${o.key})`
                }
                aria-label={
                  isOut ? `Put option ${o.key} back` : `Rule option ${o.key} out`
                }
                className={`w-8 shrink-0 rounded-card border font-mono text-xs transition-colors ${
                  isOut
                    ? "border-line bg-sunk text-ink/55"
                    : "border-transparent text-ink/25 hover:border-line hover:text-ink/60"
                }`}
              >
                {isOut ? "↺" : "✕"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Flag a question to come back to it, from either card. Optimistic: the
 * label flips immediately and reverts only if the write fails, because
 * a flag is a bookmark and waiting on a round trip to see it move makes
 * it feel broken.
 */
/** Flag state, held apart from the button so that F can reach it. */
function useFlag(questionId: number, initiallyFlagged: boolean) {
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [saving, setSaving] = useState(false);

  const toggle = useCallback(async () => {
    if (saving) return;
    const next = !flagged;
    setFlagged(next);
    setSaving(true);
    const result = await toggleQuestionFlag(questionId, next);
    setSaving(false);
    if (result.error) setFlagged(!next);
  }, [flagged, saving, questionId]);

  return { flagged, toggle };
}

/** A scenario carries its own flag: an EMQ set is scored one scenario
 *  at a time, so it is flagged one scenario at a time too. */
function ScenarioFlag({
  questionId,
  initiallyFlagged,
  className,
}: {
  questionId: number;
  initiallyFlagged: boolean;
  className?: string;
}) {
  const { flagged, toggle } = useFlag(questionId, initiallyFlagged);
  return <FlagButton flagged={flagged} onToggle={toggle} className={className} />;
}

function FlagButton({
  flagged,
  onToggle,
  className = "",
}: {
  flagged: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={flagged}
      title={
        flagged
          ? "Flagged for review — click to remove (F)"
          : "Flag to review later (F)"
      }
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
        flagged
          ? "border-accent/40 bg-accent/10 text-accent-ink"
          : "border-line text-ink/55 hover:border-good hover:text-good"
      } ${className}`.trim()}
    >
      <span aria-hidden>{flagged ? "⚑" : "⚐"}</span>
      {flagged ? "Flagged" : "Flag"}
    </button>
  );
}

/**
 * The "Explanation" block under a revealed card: why the answer is
 * right and what rules the others out, in one flow. The options already
 * carry their own correct/incorrect label and the source is named below
 * by SourceList, so nothing is repeated here.
 */
function ExplanationList({ question }: { question: SessionQuestion }) {
  // Written for the card: one paragraph, no option-by-option roll call.
  // Older questions predate that field and only have the per-option
  // working, so it is run together as prose — correct reasoning first,
  // then what rules the others out — rather than shown as a numbered
  // list, which is what made the section repetitive to read.
  // An EMQ is answered from a shared list, so the options that were not
  // chosen are mostly just not this scenario's answer, and explaining
  // them teaches nothing. Only the correct one is shown — including on
  // sets generated before that was the rule.
  const parts =
    question.format === "emq"
      ? question.explanations.filter((e) => e.verdict === "correct")
      : [
          ...question.explanations.filter((e) => e.verdict === "correct"),
          ...question.explanations.filter((e) => e.verdict !== "correct"),
        ];

  const body =
    question.format !== "emq" && question.explanation?.trim()
      ? question.explanation
      : parts
          .map((e) => e.text.trim())
          .filter(Boolean)
          .join(" ");

  if (!body) return null;

  return (
    <div className="mt-4">
      <p className="font-mono text-xs uppercase tracking-wide text-good">
        Explanation
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink/85">
        {body}
      </p>
      {question.explanation_table && (
        <ExplanationTable table={question.explanation_table} />
      )}
    </div>
  );
}

function SimilarValues({ groups }: { groups: SimilarValueGroup[] | null }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="mt-4 rounded-card border border-line bg-raised/60 p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-good">
        Similar values
      </p>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <div key={group.value}>
            <p className="font-mono text-sm font-medium text-accent-ink">
              {group.value}
            </p>
            <ul className="mt-1 space-y-1">
              {group.facts.map((fact, i) => (
                <li key={i} className="text-sm text-ink/85">
                  {/* What it is about, first: a statement lifted out of a
                      guideline routinely leaves its subject behind —
                      "Severe immediate side effects occur in around 1% of
                      people" never says of what. */}
                  {fact.subject && (
                    <span className="block font-medium text-ink">
                      {fact.subject}
                    </span>
                  )}
                  <span className={fact.subject ? "text-ink/75" : ""}>
                    {fact.statement}
                  </span>
                  {fact.source_reference && (
                    <span className="ml-1 font-mono text-[11px] text-ink/50">
                      ({fact.source_reference})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: SessionQuestion["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
        {sources.length === 1 ? "Source" : "Sources"}
      </p>
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
    </div>
  );
}
