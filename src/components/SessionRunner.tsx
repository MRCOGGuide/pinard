"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SessionQuestion } from "@/lib/session";
import { groupIntoItems, itemSize, type QuestionItem } from "@/lib/emq";
import {
  getSimilarValues,
  recordAnswer,
  refreshProgressViews,
  toggleQuestionFlag,
  type SimilarValueGroup,
} from "@/app/session/actions";
import { AskPinard } from "@/components/AskPinard";
import { ReportQuestion } from "@/components/ReportQuestion";
import { ExplanationTable } from "@/components/ExplanationTable";
import { QuestionFigure } from "@/components/QuestionFigure";
import { PricingTable } from "@/components/PricingTable";
import type { TierPricing } from "@/lib/billing";
import { formatReference } from "@/lib/reference";
import { LeadIn } from "@/components/LeadIn";
import { NONE } from "@/components/ui";

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
  anonymous = false,
}: {
  questions: SessionQuestion[];
  title: string;
  endCard?: "default" | "paywall";
  prices?: TierPricing[];
  /** Ids this candidate has already flagged, so the button starts right. */
  flaggedIds?: number[];
  /**
   * Nobody is signed in: the sample on the public page.
   *
   * Everything that writes to an account is left out rather than
   * allowed to fail — the answer is not recorded, there is no flag and
   * no similar values, and no progress to rebuild. The marking is done
   * here instead of by the server, which it can be: a sample question
   * arrives with its correct_key, the same as every other question
   * this component has ever been given.
   */
  anonymous?: boolean;
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
    if (finished && !anonymous) void refreshProgressViews();
  }, [finished, anonymous]);

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
      ? `${answeredBefore + 1} of ${questions.length}`
      : `${answeredBefore + 1} to ${answeredBefore + size} of ${questions.length}`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 font-ui text-[14px] text-ink/60">
        <span>{title}</span>
        <span className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setKeysOpen(true)}
            className="hidden rounded px-1 text-ink/55 underline-offset-2 hover:text-ink-strong hover:underline sm:inline"
          >
            Keyboard shortcuts
          </button>
          <span className="tabular-nums text-ink-strong">{counter}</span>
        </span>
      </div>
      <SessionTrace done={answeredBefore} total={questions.length} />
      <div className="mb-7" />

      <ShortcutSheet open={keysOpen} onClose={() => setKeysOpen(false)} />

      {item.kind === "emq_set" ? (
        <EmqSetCard
          key={item.key}
          item={item}
          flagged={flagged}
          chatEnabled={chatEnabled}
          anonymous={anonymous}
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
          anonymous={anonymous}
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
  anonymous = false,
  sessionId,
  isLast,
  onDone,
}: {
  question: SessionQuestion;
  flagged: boolean;
  chatEnabled: boolean;
  anonymous?: boolean;
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
  const [askOpen, setAskOpen] = useState(false);
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

    // No account to record against. Mark it here and show the feedback,
    // which is the whole of what a visitor came for.
    if (anonymous) {
      setWasCorrect(chosen === question.correct_key);
      setRevealed(true);
      return;
    }

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
    if (letter === "F" && !anonymous) {
      event.preventDefault();
      void flag.toggle();
      return;
    }
    if (revealed) {
      // The follow-up box, on the key every search field uses.
      if (event.key === "/" && chatEnabled) {
        event.preventDefault();
        setAskOpen(true);
        return;
      }
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
    // A page, not a card: the vignette is read like the guidance it was
    // written from, and only what can be pressed sits in a box.
    <article>
      <QuestionMeta
        label={question.format === "emq" ? "Extended matching" : "Single best answer"}
        section={question.section_title}
        seconds={seconds}
        stopped={revealed}
        flag={anonymous ? null : flag}
      />

      {question.lead_in && (
        <LeadIn
          text={question.lead_in}
          className="reading mt-4 max-w-[38rem] italic text-ink/75"
        />
      )}
      <p className="reading mt-4 max-w-[38rem] whitespace-pre-wrap text-ink">
        {question.stem}
      </p>
      {/* A question read from a trace shows it before the options. */}
      <QuestionFigure figure={question.figure} placement="stem" />

      <OptionList
        question={question}
        chosen={chosen}
        eliminated={eliminated}
        revealed={revealed}
        disabled={saving}
        onChoose={select}
        onEliminate={eliminate}
      />

      {error && (
        <p role="alert" className="mt-3 text-[15px] text-accent-ink">
          {error}
        </p>
      )}

      {!revealed && (
        <div className={QUESTION_BAR}>
          <button
            type="button"
            onClick={check}
            disabled={!chosen || saving}
            className={PRIMARY_BUTTON}
          >
            {saving ? "Checking" : "Check answer"}
          </button>
          <button
            type="button"
            onClick={() => onDone(0)}
            disabled={saving}
            className={QUIET_BUTTON}
          >
            {isLast ? "Skip and finish" : "Skip"}
          </button>
          <span className="ml-auto hidden text-[13px] text-ink/50 sm:inline">
            {chosen ? "Enter to check" : "Keys A to E choose an option"}
          </span>
        </div>
      )}

      {revealed && (
        <div className="ed-reveal mt-8 border-t border-line pt-6">
          <Verdict
            correct={wasCorrect}
            text={
              wasCorrect
                ? "Correct."
                : `The answer is ${question.correct_key}.`
            }
          />
          <ExplanationList question={question} />
          <SimilarValues groups={similar} />
          {/* Before the sources: asking is part of understanding the
              answer, and the source list is a footnote to it. */}
          {chatEnabled && (
            <AskPinard
              questionId={question.id}
              open={askOpen}
              onOpenChange={setAskOpen}
            />
          )}
          <SourceList sources={question.sources} />
          {!anonymous && <ReportQuestion questionId={question.id} />}
          <div className={QUESTION_BAR}>
            <button
              type="button"
              onClick={() => onDone(wasCorrect ? 1 : 0)}
              className={PRIMARY_BUTTON}
            >
              {isLast ? "Finish session" : "Next question"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* The question screen's own furniture                                 */
/* ------------------------------------------------------------------ */

/*
  Buttons sized for a thumb (48px), in the interface face. Press feedback
  is a 1% scale on the transform, so it costs no layout.
*/
const PRIMARY_BUTTON =
  "inline-flex h-12 items-center justify-center rounded-[10px] bg-brand px-6 font-ui text-[16px] font-semibold text-on-brand transition-[transform,background-color] duration-150 ease-out hover:bg-good active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none";
const QUIET_BUTTON =
  "inline-flex h-12 items-center justify-center rounded-[10px] px-4 font-ui text-[16px] font-medium text-ink/70 transition-colors duration-150 ease-out hover:bg-sunk hover:text-ink-strong disabled:opacity-40";

/*
  The action row. On a phone it stays at the bottom of the screen while
  the question scrolls, on the page's own paper; from `sm` up it sits
  under the question where it was written.
*/
const QUESTION_BAR =
  "sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-t border-line bg-ground px-4 py-3 " +
  "sm:static sm:z-auto sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0";

/** What kind of question, from which part of the syllabus, how long so
 *  far, and the flag: one quiet line, in sentence case. */
function QuestionMeta({
  label,
  section,
  seconds,
  stopped,
  flag,
}: {
  label: string;
  section: string;
  seconds: number;
  stopped: boolean;
  flag: { flagged: boolean; toggle: () => void } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink/60">
      <span className="font-semibold text-ink-strong">{label}</span>
      <span>{section}</span>
      <span className="ml-auto flex items-center gap-3">
        <Timer seconds={seconds} stopped={stopped} />
        {flag && <FlagButton flagged={flag.flagged} onToggle={flag.toggle} />}
      </span>
    </div>
  );
}

/** "Correct." or "The answer is C.", with a drawn mark rather than a
 *  typed symbol, in the colour of the outcome. */
function Verdict({ correct, text }: { correct: boolean; text: string }) {
  return (
    <p
      className={`flex items-center gap-2.5 font-serif text-[22px] font-semibold leading-tight ${
        correct ? "text-good" : "text-accent-ink"
      }`}
    >
      <Mark kind={correct ? "right" : "wrong"} className="h-5 w-5 shrink-0" />
      {text}
    </p>
  );
}

/** A tick or a cross, drawn: the same weight as the type beside it. */
function Mark({ kind, className = "" }: { kind: "right" | "wrong"; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none">
      {kind === "right" ? (
        <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* EMQ set — lead-in, shared option list, then every scenario           */
/* ------------------------------------------------------------------ */

function EmqSetCard({
  item,
  flagged,
  chatEnabled,
  anonymous = false,
  sessionId,
  isLast,
  onDone,
}: {
  item: Extract<QuestionItem<SessionQuestion>, { kind: "emq_set" }>;
  /** Flagging is per scenario: each one is answered and scored alone. */
  flagged: Set<number>;
  chatEnabled: boolean;
  anonymous?: boolean;
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

    // Nobody to record against: mark the set here, as SingleCard does.
    if (anonymous) {
      setSaving(false);
      setCorrectCount(
        item.scenarios.filter((s) => answers[s.id] === s.correct_key).length
      );
      setRevealed(true);
      return;
    }

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
    <article>
      <QuestionMeta
        label={`Extended matching, ${item.scenarios.length} scenarios`}
        section={item.scenarios[0].section_title}
        seconds={seconds}
        stopped={revealed}
        flag={null}
      />

      {item.leadIn && (
        <LeadIn
          text={item.leadIn}
          className="reading mt-4 max-w-[38rem] whitespace-pre-wrap text-ink/80"
        />
      )}

      {/* Laid out as the paper is: one option list, then the scenarios
          under it. Set as a reference list (two columns where there is
          room), not a box inside a box. */}
      <ol className="mt-5 grid gap-x-8 gap-y-1.5 border-y border-line py-4 font-ui text-[15px] text-ink/85 sm:grid-cols-2">
        {item.options.map((o) => (
          <li key={o.key} className="flex gap-3">
            <span className="w-4 shrink-0 font-semibold tabular-nums text-ink/50">
              {o.key}
            </span>
            <span>{o.text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-2 divide-y divide-line">
        {item.scenarios.map((s, n) => (
          <div key={s.id} className="py-6">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold text-ink-strong">
                Scenario {n + 1} of {item.scenarios.length}
              </p>
              {!anonymous && (
                <ScenarioFlag
                  questionId={s.id}
                  initiallyFlagged={flagged.has(s.id)}
                  className="ml-auto"
                />
              )}
            </div>
            <p className="reading mt-2 max-w-[38rem] whitespace-pre-wrap text-ink">
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
              <div className="ed-reveal mt-5">
                <Verdict
                  correct={answers[s.id] === s.correct_key}
                  text={
                    answers[s.id] === s.correct_key
                      ? "Correct."
                      : `The answer is ${s.correct_key}.`
                  }
                />
                <ExplanationList question={s} />
                <SimilarValues groups={similar[s.id] ?? null} />
                {chatEnabled && <AskPinard questionId={s.id} />}
                {!anonymous && <ReportQuestion questionId={s.id} />}

              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[15px] text-accent-ink">
          {error}
        </p>
      )}

      {!revealed ? (
        <div className={QUESTION_BAR}>
          <button
            type="button"
            onClick={submit}
            disabled={!answeredAll || saving}
            className={PRIMARY_BUTTON}
          >
            {saving
              ? "Checking"
              : answeredAll
                ? "Check answers"
                : `Answer all ${item.scenarios.length} scenarios`}
          </button>
          <button
            type="button"
            onClick={() => onDone(0)}
            disabled={saving}
            className={QUIET_BUTTON}
          >
            {isLast ? "Skip and finish" : "Skip set"}
          </button>
        </div>
      ) : (
        <div className="ed-reveal border-t border-line pt-5">
          <p className="font-ui text-[16px] font-semibold tabular-nums text-ink-strong">
            {correctCount} of {item.scenarios.length} correct in this set
          </p>
          <SourceList sources={item.scenarios[0].sources} />
          <div className={QUESTION_BAR}>
            <button
              type="button"
              onClick={() => onDone(correctCount)}
              className={PRIMARY_BUTTON}
            >
              {isLast ? "Finish session" : "Next question"}
            </button>
          </div>
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
      <div className="mt-4 space-y-2 font-ui text-[16px]">
        <p
          className={`flex gap-3 rounded-[10px] border px-4 py-3 ${
            right
              ? "border-good bg-good/10 text-ink"
              : "border-accent bg-accent/10 text-ink"
          }`}
        >
          <Mark
            kind={right ? "right" : "wrong"}
            className={`mt-0.5 h-5 w-5 shrink-0 ${right ? "text-good" : "text-accent-ink"}`}
          />
          <span>
            <span className="block text-[13px] text-ink/60">Your answer</span>
            <span className="font-semibold">{picked?.key ?? NONE}</span>{" "}
            {picked?.text ?? "not answered"}
          </span>
        </p>
        {!right && (
          <p className="flex gap-3 rounded-[10px] border border-good bg-good/10 px-4 py-3">
            <Mark kind="right" className="mt-0.5 h-5 w-5 shrink-0 text-good" />
            <span>
              <span className="block text-[13px] text-ink/60">Correct answer</span>
              <span className="font-semibold">{correct?.key}</span> {correct?.text}
            </span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <label htmlFor={id} className="sr-only">
        Answer for scenario {number}
      </label>
      <select
        id={id}
        value={chosen ?? ""}
        disabled={disabled}
        onChange={(e) => onChoose(e.target.value)}
        className="h-12 w-full rounded-[10px] border border-line bg-surface px-3 font-ui text-[16px] text-ink transition-colors duration-150 ease-out hover:border-good focus:border-good focus:outline-none focus:ring-2 focus:ring-good/30 disabled:opacity-60"
      >
        <option value="" disabled>
          Choose an answer from the list
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

/**
 * How far through the session, drawn as the trace: a hairline baseline
 * across the column, the run already covered in the heartbeat colour,
 * and one complex at the leading edge. It grows by scaling, not by
 * changing width, so the move costs no layout.
 */
function SessionTrace({ done, total }: { done: number; total: number }) {
  const progress = total ? Math.min(1, done / total) : 0;
  return (
    <div
      className="relative h-4"
      role="progressbar"
      aria-label="Progress through this session"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <div
        className="absolute left-0 top-1/2 h-[1.5px] w-full origin-left -translate-y-[0.25px] bg-accent transition-transform duration-[250ms] ease-out motion-reduce:transition-none"
        style={{ transform: `scaleX(${progress})` }}
      />
      <svg
        viewBox="0 0 24 16"
        className="absolute top-0 h-4 w-6 text-accent"
        // Kept inside the column at both ends rather than centred on the
        // point, so it is never half off the edge at the start or finish.
        style={{ left: `calc(${progress * 100}% - ${progress * 24}px)` }}
        aria-hidden="true"
      >
        <path
          d="M0 8 H6 L9 2 L13 14 L16 5 L18 8 H24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Time on this question. Counting up rather than down: a session is
 *  for learning, and a clock running out is the mock's job. */
function Timer({ seconds, stopped }: { seconds: number; stopped: boolean }) {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return (
    <span
      className={`tabular-nums ${stopped ? "text-ink/40" : "text-ink/60"}`}
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
  ["/", "Ask a follow-up"],
  ["F", "Flag for review"],
  ["?", "This list"],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-card border border-line bg-surface p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-ui text-[15px] font-semibold text-ink-strong">
          Keyboard shortcuts
        </h2>
        <dl className="mt-3 space-y-2">
          {SHORTCUTS.map(([key, what]) => (
            <div key={key} className="flex items-baseline gap-3">
              <dt className="w-28 shrink-0 font-mono text-label text-ink-strong">
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
    <ul className="mt-6 space-y-2.5">
      {question.options.map((o) => {
        const isChosen = chosen === o.key;
        const isCorrect = o.key === question.correct_key;
        const isOut = !revealed && eliminated.has(o.key);
        // Chosen is said by a ring and a filled letter, not colour alone.
        let row = "border-line bg-surface hover:border-good/60";
        let letter = "border-line text-ink/60";
        if (revealed) {
          if (isCorrect) {
            row = "border-good bg-good/10";
            letter = "border-good bg-good text-on-brand";
          } else if (isChosen) {
            row = "border-accent bg-accent/10";
            letter = "border-accent bg-accent text-on-brand";
          } else {
            row = "border-line bg-surface opacity-60";
          }
        } else if (isOut) {
          row = "border-line bg-sunk";
          letter = "border-line text-ink/35";
        } else if (isChosen) {
          row = "border-good bg-surface ring-1 ring-good";
          letter = "border-good bg-good text-on-brand";
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
              className={`flex min-h-12 min-w-0 flex-1 items-start gap-3.5 rounded-[10px] border px-4 py-3 text-left font-ui text-[16px] leading-snug transition-[transform,border-color,background-color,box-shadow] duration-150 ease-out active:scale-[0.995] disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none ${row}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors duration-150 ${letter}`}
              >
                {o.key}
              </span>
              <span className="min-w-0 flex-1 pt-px">
                <span className={isOut ? "text-ink/40 line-through" : "text-ink"}>
                  {o.text}
                </span>
                {revealed && (isCorrect || isChosen) && (
                  <span
                    className={`mt-1 flex items-center gap-1.5 text-[13px] font-semibold ${
                      isCorrect ? "text-good" : "text-accent-ink"
                    }`}
                  >
                    <Mark kind={isCorrect ? "right" : "wrong"} className="h-3.5 w-3.5" />
                    {isCorrect ? (isChosen ? "Your answer, correct" : "Correct answer") : "Your answer"}
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
                className={`flex w-10 shrink-0 items-center justify-center rounded-[10px] border transition-colors duration-150 ease-out ${
                  isOut
                    ? "border-line bg-sunk text-ink/60"
                    : "border-transparent text-ink/30 hover:border-line hover:text-ink/60"
                }`}
              >
                <StrikeIcon restore={isOut} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Rule out (a line through a letter) or put back (a curved arrow). */
function StrikeIcon({ restore }: { restore: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      {restore ? (
        <path
          d="M5 9a5 5 0 1 1 1.5 4.6M5 9V5.5M5 9h3.5"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <path d="M6.5 14.5L10 5.5l3.5 9M7.8 11.3h4.4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 10h12" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
        </>
      )}
    </svg>
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
          ? "Flagged for review: click to remove (F)"
          : "Flag to review later (F)"
      }
      className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 ease-out ${
        flagged
          ? "border-accent/40 bg-accent/10 text-accent-ink"
          : "border-line text-ink/60 hover:border-good hover:text-good"
      } ${className}`.trim()}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          d="M4 14V2.5M4 3h7l-1.5 2.5L11 8H4"
          fill={flagged ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
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
    <div className="mt-5">
      <h3 className="font-ui text-[15px] font-semibold text-ink-strong">
        Explanation
      </h3>
      <p className="reading mt-2 max-w-[38rem] whitespace-pre-line text-ink/90">
        {body}
      </p>
      {question.explanation_table && (
        <ExplanationTable table={question.explanation_table} />
      )}
      <QuestionFigure figure={question.figure} placement="explanation" />
    </div>
  );
}

function SourceList({ sources }: { sources: SessionQuestion["sources"] }) {
  if (sources.length === 0) return null;
  return (
    // Set as a reference note: the guideline's title, then where it was
    // published, the way a candidate would cite it.
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="font-ui text-[13px] font-semibold text-ink/60">
        {sources.length === 1 ? "Source" : "Sources"}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {sources.map((s, i) => (
          <li key={i} className="font-ui text-[14px] leading-snug text-ink/75">
            <span className="font-semibold text-ink/90">{s.title}</span>
            {formatReference(s) && (
              <span className="text-ink/60">. {formatReference(s)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SimilarValues({ groups }: { groups: SimilarValueGroup[] | null }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="mt-6 border-l-2 border-good/50 pl-4">
      <h3 className="font-ui text-[15px] font-semibold text-ink-strong">
        Similar values
      </h3>
      <p className="mt-0.5 font-ui text-[13px] text-ink/60">
        Other facts in the guidance with the same figure, worth learning together.
      </p>
      <div className="mt-3 space-y-3 font-ui text-[15px]">
        {groups.map((group) => (
          <div key={group.value}>
            <p className="font-semibold tabular-nums text-ink-strong">
              {group.value}
            </p>
            <ul className="mt-1 space-y-1">
              {group.facts.map((fact, i) => (
                <li key={i} className="text-sm text-ink/85">
                  {/* What it is about, first: a statement lifted out of a
                      guideline routinely leaves its subject behind, 
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
                    <span className="ml-1 text-[13px] text-ink/55">
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

