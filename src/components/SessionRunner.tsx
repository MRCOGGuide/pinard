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
        <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
          <p className="font-mono text-sm text-greentop">
            {correctCount} / {questions.length} on your free sample
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            Ready for the full syllabus?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-graphite/70">
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
      <div className="rounded-card border border-hairline bg-porcelain p-6 text-center shadow-card">
        <p className="font-mono text-sm text-greentop">Session complete</p>
        <p className="mt-2 font-display text-4xl font-semibold text-theatre">
          {correctCount} / {questions.length}
        </p>
        <p className="mt-1 font-mono text-sm text-graphite/60">{pct}% correct</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/progress"
            className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            See your progress
          </Link>
          <Link
            href="/"
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
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
      <div className="mb-3 flex items-center justify-between text-sm text-graphite/60">
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
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          {question.format}
        </span>
        <span className="text-graphite/60">{question.section_title}</span>
        <FlagButton questionId={question.id} initiallyFlagged={flagged} />
      </div>

      {question.lead_in && (
        <p className="mt-3 text-sm italic text-graphite/70">{question.lead_in}</p>
      )}
      <p className="mt-3 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
        {question.stem}
      </p>

      <OptionList
        question={question}
        chosen={chosen}
        revealed={revealed}
        disabled={saving}
        onChoose={choose}
      />

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {!revealed && (
        <button
          type="button"
          onClick={() => onDone(0)}
          disabled={saving}
          className="mt-5 rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/70 hover:text-theatre disabled:opacity-50"
        >
          {isLast ? "Skip and finish" : "Skip question"}
        </button>
      )}

      {revealed && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="text-sm font-medium text-theatre">
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
            className="mt-5 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
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
    <article className="rounded-card border border-hairline bg-porcelain p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-hairline px-2 py-0.5 font-mono uppercase text-graphite/60">
          emq set
        </span>
        <span className="font-mono text-[11px] text-greentop">
          {item.scenarios.length} scenarios · one option list
        </span>
        <span className="text-graphite/60">
          {item.scenarios[0].section_title}
        </span>
      </div>

      {item.leadIn && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-graphite/80">
          {item.leadIn}
        </p>
      )}

      {/* The option list sits above the scenarios: every lead-in tells
          the candidate to choose "from the list above". */}
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
            <div className="flex items-center gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wide text-greentop">
                Scenario {n + 1} of {item.scenarios.length}
              </p>
              <FlagButton questionId={s.id} initiallyFlagged={flagged.has(s.id)} />
            </div>
            <p className="mt-2 whitespace-pre-wrap font-display text-[17px] leading-relaxed text-graphite">
              {s.stem}
            </p>

            <OptionList
              question={s}
              chosen={answers[s.id] ?? null}
              revealed={revealed}
              disabled={saving}
              compact
              onChoose={(key) =>
                setAnswers((a) => (revealed ? a : { ...a, [s.id]: key }))
              }
            />

            {revealed && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className="text-sm font-medium text-theatre">
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

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {!revealed ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={!answeredAll || saving}
            className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
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
            className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/70 hover:text-theatre disabled:opacity-50"
          >
            {isLast ? "Skip and finish" : "Skip set"}
          </button>
        </div>
      ) : (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="font-mono text-sm text-greentop">
            {correctCount} / {item.scenarios.length} in this set
          </p>
          <SourceList sources={item.scenarios[0].sources} />
          <button
            type="button"
            onClick={() => onDone(correctCount)}
            className="mt-5 rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
          >
            {isLast ? "Finish session" : "Next question"}
          </button>
        </div>
      )}
    </article>
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
  compact = false,
  onChoose,
}: {
  question: SessionQuestion;
  chosen: string | null;
  revealed: boolean;
  disabled: boolean;
  compact?: boolean;
  onChoose: (key: string) => void;
}) {
  return (
    <ul className={compact ? "mt-3 space-y-1.5" : "mt-5 space-y-2"}>
      {question.options.map((o) => {
        const isChosen = chosen === o.key;
        const isCorrect = o.key === question.correct_key;
        let cls = "border-hairline bg-white hover:border-greentop hover:bg-sage";
        if (revealed) {
          if (isCorrect) cls = "border-greentop bg-sage";
          else if (isChosen) cls = "border-heartbeat bg-heartbeat/10";
          else cls = "border-hairline bg-white opacity-70";
        } else if (isChosen) {
          cls = "border-greentop bg-sage";
        }
        return (
          <li key={o.key}>
            <button
              type="button"
              disabled={revealed || disabled}
              onClick={() => onChoose(o.key)}
              className={`flex w-full gap-3 rounded-card border px-4 py-3 text-left text-sm transition-colors ${cls}`}
            >
              <span className="font-mono text-xs leading-5 text-graphite/60">
                {o.key}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-graphite">{o.text}</span>
                {revealed && (
                  <span
                    className={`mt-1 block font-mono text-[11px] uppercase tracking-wide ${
                      isCorrect
                        ? "text-greentop"
                        : isChosen
                          ? "text-heartbeat"
                          : "text-graphite/45"
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
          ? "border-heartbeat/40 bg-heartbeat/10 text-heartbeat"
          : "border-hairline text-graphite/55 hover:border-greentop hover:text-greentop"
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
  const body = question.explanation?.trim()
    ? question.explanation
    : [
        ...question.explanations.filter((e) => e.verdict === "correct"),
        ...question.explanations.filter((e) => e.verdict !== "correct"),
      ]
        .map((e) => e.text.trim())
        .filter(Boolean)
        .join(" ");

  if (!body) return null;

  return (
    <div className="mt-4">
      <p className="font-mono text-xs uppercase tracking-wide text-greentop">
        Explanation
      </p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-graphite/85">
        {body}
      </p>
    </div>
  );
}

function SimilarValues({ groups }: { groups: SimilarValueGroup[] | null }) {
  if (!groups || groups.length === 0) return null;
  return (
    <div className="mt-4 rounded-card border border-hairline bg-white/60 p-4">
      <p className="font-mono text-xs uppercase tracking-wide text-greentop">
        Similar values
      </p>
      <div className="mt-2 space-y-3">
        {groups.map((group) => (
          <div key={group.value}>
            <p className="font-mono text-sm font-medium text-heartbeat">
              {group.value}
            </p>
            <ul className="mt-1 space-y-1">
              {group.facts.map((fact, i) => (
                <li key={i} className="text-sm text-graphite/85">
                  {/* What it is about, first: a statement lifted out of a
                      guideline routinely leaves its subject behind —
                      "Severe immediate side effects occur in around 1% of
                      people" never says of what. */}
                  {fact.subject && (
                    <span className="block font-medium text-graphite">
                      {fact.subject}
                    </span>
                  )}
                  <span className={fact.subject ? "text-graphite/75" : ""}>
                    {fact.statement}
                  </span>
                  {fact.source_reference && (
                    <span className="ml-1 font-mono text-[11px] text-graphite/50">
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
    <div className="mt-4 border-t border-hairline pt-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
        {sources.length === 1 ? "Source" : "Sources"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {sources.map((s, i) => (
          <li key={i} className="text-xs leading-relaxed text-graphite/70">
            <span className="font-medium text-graphite/85">{s.title}</span>
            {formatReference(s) && (
              <span className="text-graphite/60"> · {formatReference(s)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
