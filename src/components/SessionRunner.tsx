"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
        <span className="font-mono">{counter}</span>
      </div>

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
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarValueGroup[] | null>(null);

  async function choose(key: string) {
    if (revealed || saving) return;
    setChosen(key);
    setSaving(true);
    setError(null);
    const result = await recordAnswer({
      questionId: question.id,
      chosenKey: key,
      secondsTaken: (Date.now() - startedAt.current) / 1000,
      sessionId,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      setChosen(null);
      return;
    }
    setWasCorrect(Boolean(result.is_correct));
    setRevealed(true);
    getSimilarValues(question.id)
      .then(setSimilar)
      .catch(() => setSimilar(null));
  }

  return (
    <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full border border-line px-2 py-0.5 font-mono uppercase text-ink/60">
          {question.format}
        </span>
        <span className="text-ink/60">{question.section_title}</span>
        <FlagButton questionId={question.id} initiallyFlagged={flagged} />
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
        revealed={revealed}
        disabled={saving}
        onChoose={choose}
      />

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}

      {!revealed && (
        <button
          type="button"
          onClick={() => onDone(0)}
          disabled={saving}
          className="mt-5 rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/70 hover:text-ink-strong disabled:opacity-50"
        >
          {isLast ? "Skip and finish" : "Skip question"}
        </button>
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

  const answeredAll = item.scenarios.every((s) => answers[s.id]);

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
              <FlagButton questionId={s.id} initiallyFlagged={flagged.has(s.id)} />
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

      {error && <p className="mt-3 text-sm text-accent">{error}</p>}

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

function OptionList({
  question,
  chosen,
  revealed,
  disabled,
  onChoose,
}: {
  question: SessionQuestion;
  chosen: string | null;
  revealed: boolean;
  disabled: boolean;
  onChoose: (key: string) => void;
}) {
  return (
    <ul className="mt-5 space-y-2">
      {question.options.map((o) => {
        const isChosen = chosen === o.key;
        const isCorrect = o.key === question.correct_key;
        let cls = "border-line bg-raised hover:border-good hover:bg-sunk";
        if (revealed) {
          if (isCorrect) cls = "border-good bg-sunk";
          else if (isChosen) cls = "border-accent bg-accent/10";
          else cls = "border-line bg-raised opacity-70";
        } else if (isChosen) {
          cls = "border-good bg-sunk";
        }
        return (
          <li key={o.key}>
            <button
              type="button"
              disabled={revealed || disabled}
              onClick={() => onChoose(o.key)}
              className={`flex w-full gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors ${cls}`}
            >
              <span className="font-mono text-xs leading-5 text-ink/60">
                {o.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink">{o.text}</span>
                {revealed && (
                  <span
                    className={`mt-1 block font-mono text-[11px] uppercase tracking-wide ${
                      isCorrect
                        ? "text-good"
                        : isChosen
                          ? "text-accent"
                          : "text-ink/45"
                    }`}
                  >
                    {isCorrect ? "Correct" : "Incorrect"}
                  </span>
                )}
              </span>
            </button>
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
function FlagButton({
  questionId,
  initiallyFlagged,
}: {
  questionId: number;
  initiallyFlagged: boolean;
}) {
  const [flagged, setFlagged] = useState(initiallyFlagged);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !flagged;
    setFlagged(next);
    setSaving(true);
    const result = await toggleQuestionFlag(questionId, next);
    setSaving(false);
    if (result.error) setFlagged(!next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={flagged}
      title={
        flagged ? "Flagged for review — click to remove" : "Flag to review later"
      }
      className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
        flagged
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-line text-ink/55 hover:border-good hover:text-good"
      }`}
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
            <p className="font-mono text-sm font-medium text-accent">
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
