"use client";

import Link from "next/link";
import { Explain } from "@/components/Explain";
import { useRouter } from "next/navigation";
import { Banner, Button } from "@/components/ui";
import { GradeBar } from "@/components/GradeBar";
import { ScrollFade } from "@/components/scroll";
import { Trace } from "@/components/Trace";
import { Confirm } from "@/components/ui/Confirm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { submitMockPaper } from "./actions";
import {
  recordMockAttempt,
  resetMockAttempts,
  type MockAttempt,
} from "./attempt-actions";
import { groupIntoItems, itemIds, type QuestionItem } from "@/lib/emq";
import {
  formatClock,
  emqSetScore,
  markPaper,
  sectionBreakdown,
  paperSeconds,
  sbaAdviceSeconds,
  type MarkedPaper,
  type PaperShape,
  type SectionScore,
} from "@/lib/mock";
import { ExplanationTable } from "@/components/ExplanationTable";
import { ReportQuestion } from "@/components/ReportQuestion";
import { formatReference } from "@/lib/reference";
import { QuestionFigure } from "@/components/QuestionFigure";
import type { SessionQuestion } from "@/lib/session";
import { LeadIn } from "@/components/LeadIn";

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
  history,
}: {
  questions: SessionQuestion[];
  passMark: number;
  fullPaper: PaperShape;
  /** Past sittings, newest first, read on the server. */
  history: MockAttempt[];
}) {
  // SBAs first, then whole EMQ sets — the order of the paper.
  const items = useMemo(() => {
    const grouped = groupIntoItems(questions);
    return [
      ...grouped.filter((i) => i.kind !== "emq_set"),
      ...grouped.filter((i) => i.kind === "emq_set"),
    ];
  }, [questions]);

  /* `emq` is SETS, which is what the paper is counted in and what the
     clock is paced by. The scenarios inside them are counted
     separately, because that is what gets answered and marked. */
  const shape: PaperShape = useMemo(
    () => ({
      sba: questions.filter((q) => q.format === "sba").length,
      emq: items.filter((i) => i.kind === "emq_set").length,
    }),
    [questions, items]
  );

  const totalSeconds = useMemo(() => paperSeconds(shape), [shape]);
  const adviceAt = useMemo(() => sbaAdviceSeconds(shape), [shape]);

  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("brief");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(totalSeconds);
  const [marked, setMarked] = useState<MarkedPaper | null>(null);
  const [wrongIds, setWrongIds] = useState<Set<number>>(new Set());
  /* How this paper went, topic by topic. Empty until one is handed in,
     which is what Reset returns it to. */
  const [breakdown, setBreakdown] = useState<SectionScore[]>([]);
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

  /* Counted in items, not in scenarios. An EMQ set is one question
     here as it is everywhere else in the paper, and a set only counts
     as answered once every scenario under it has been. A candidate who
     saw "0 / 190" on a paper described to them as a hundred questions
     was being told the two things cannot both be true. */
  const answeredCount = items.filter((it) =>
    itemIds(it).every((id) => answers[id])
  ).length;

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

    const sections = sectionBreakdown(questions, correct);
    /* Each EMQ set earns the fraction of itself answered correctly, so
       the EMQ half scores out of fifty sets rather than out of the
       scenarios inside them. */
    const emqSets = items
      .filter((it) => it.kind === "emq_set")
      .map((it) => {
        const ids = itemIds(it);
        return {
          correct: ids.filter((id) => correct.has(id)).length,
          total: ids.length,
        };
      });
    const result = markPaper({
      sbaCorrect: questions.filter(
        (q) => q.format === "sba" && correct.has(q.id)
      ).length,
      sbaTotal: shape.sba,
      emqCorrect: emqSetScore(emqSets),
      emqTotal: emqSets.length,
      passMark,
    });

    setWrongIds(wrong);
    setBreakdown(sections);
    setMarked(result);
    setSubmitting(false);
    setPhase("marked");

    /* Written after the mark is on screen, not before it. The result
       is computed here and does not depend on the row existing, so a
       database hiccup costs the history rather than the paper. */
    void recordMockAttempt({
      marked: result,
      sections,
      secondsTaken: totalSeconds - left,
    });
  }, [answers, items, left, passMark, questions, shape, totalSeconds]);

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

  /** From the results back to the mock's own page: a clean paper, and
   *  the history refetched so the sitting just marked is in it. */
  const backToBrief = useCallback(() => {
    setAnswers({});
    setIndex(0);
    setLeft(totalSeconds);
    setMarked(null);
    setFlags(new Set());
    setConfirming(false);
    setPhase("brief");
    window.scrollTo({ top: 0 });
    router.refresh();
  }, [router, totalSeconds]);

  /* ---------------------------------------------------------------- */

  if (phase === "brief") {
    return (
      <MockBrief
        shape={shape}
        fullPaper={fullPaper}
        totalSeconds={totalSeconds}
        adviceAt={adviceAt}
        passMark={passMark}
        history={history}
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
        breakdown={breakdown}
        onBack={backToBrief}
      />
    );
  }

  const item = items[index];

  return (
    <div>
      {/* The clock stays put while the paper scrolls under it. */}
      <div className="sticky top-[var(--header-h)] z-10 -mx-4 mb-4 border-b border-line bg-sunk/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-question items-center justify-between gap-3">
          <span className="font-mono text-sm text-ink/70">
            {answeredCount} / {items.length} answered
          </span>
          <span
            className={`font-mono text-lg font-semibold tabular-nums ${
              left <= 300 ? "text-accent-ink" : "text-ink-strong"
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
        <div className="flex overflow-hidden rounded-card border border-line">
          <button
            type="button"
            disabled={firstSba < 0}
            onClick={() => setIndex(firstSba)}
            className={`px-3 py-1.5 text-sm ${
              item.kind !== "emq_set"
                ? "bg-brand text-on-brand"
                : "bg-surface text-ink/75 hover:text-ink-strong"
            } disabled:opacity-40`}
          >
            SBAs ({shape.sba})
          </button>
          <button
            type="button"
            disabled={firstEmqIndex < 0}
            onClick={() => setIndex(firstEmqIndex)}
            className={`border-l border-line px-3 py-1.5 text-sm ${
              item.kind === "emq_set"
                ? "bg-brand text-on-brand"
                : "bg-surface text-ink/75 hover:text-ink-strong"
            } disabled:opacity-40`}
          >
            EMQ sets ({shape.emq})
          </button>
        </div>

        <button
          type="button"
          disabled={flaggedIndexes.length === 0}
          onClick={goToNextFlagged}
          className="rounded-card border border-warn/60 bg-surface px-3 py-1.5 text-sm text-warn hover:bg-warn/10 disabled:border-line disabled:text-ink/40"
        >
          Flagged ({flaggedIndexes.length})
        </button>
      </div>

      {showAdvice && (
        <div className="mb-4 rounded-card border border-warn/50 bg-raised p-4">
          <p className="text-sm text-ink/85">
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
                className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
              >
                Go to the EMQs
              </button>
            )}
            <button
              type="button"
              onClick={() => setAdviceSeen(true)}
              className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
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
              ? "border-warn bg-warn/10 text-warn"
              : "border-line bg-surface text-ink/65 hover:text-ink-strong"
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

      {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={index >= items.length - 1}
          onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good disabled:opacity-40"
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
          className="ml-auto rounded-card border border-accent/50 bg-surface px-4 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent/10 disabled:opacity-50"
        >
          {submitting ? "Marking…" : "Finish and mark"}
        </button>
      </div>

      {/* Handing in with questions flagged or blank is allowed, it is
          allowed in the hall: but not by accident. A dialog over the
          paper, which dims behind it, rather than a box under the
          buttons that was easy to scroll past. */}
      <Confirm
        open={confirming && !submitting}
        title="Hand in the paper?"
        confirmLabel="Hand it in"
        cancelLabel="Keep working"
        destructive
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
        extra={
          flaggedIndexes.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setConfirming(false);
                goToNextFlagged();
              }}
            >
              Go to a flagged question
            </Button>
          ) : undefined
        }
      >
        {unansweredCount > 0 && (
          <>
            {unansweredCount}{" "}
            {unansweredCount === 1 ? "question is" : "questions are"} not fully
            answered
            {flaggedIndexes.length > 0 ? ", and " : ". "}
          </>
        )}
        {flaggedIndexes.length > 0 && <>{flaggedIndexes.length} flagged for review. </>}
        Unanswered questions are marked wrong.
      </Confirm>

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

/**
 * The three things offered beside the paper: sit it, read where you
 * stand, or draw a different one.
 *
 * Feedback is how the last paper went, topic by topic, worst first,
 * which is the order a candidate with limited evenings needs them in.
 * Before a paper has been sat there is nothing to report and it says
 * so rather than reaching for the rolling topic map, which answers a
 * different question.
 *
 * Reset is the mock's own, and only the mock's: it puts these scores
 * back to nothing and draws a fresh paper, ready to be sat again. It
 * deletes nothing. An earlier version cleared every answer the
 * candidate had ever given, which took readiness, the topic map,
 * coverage, the returning questions and the streak with it, from a
 * button on the mock screen. A control sitting beside one feature
 * should not be able to empty the other six.
 *
 * Note what it therefore does not touch. The answers from a mock
 * still count towards the topic map, as practice answers do, and
 * deleting those specifically is not possible: mock answers go into
 * user_answers like any others and session_id is a bare uuid with no
 * kind beside it, so nothing in the database tells a mock from a
 * Tuesday. That needs a migration.
 */
function MockBriefActions({
  passMark,
  history,
  onStart,
}: {
  passMark: number;
  history: MockAttempt[];
  onStart: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = history[0];

  async function reset() {
    setResetting(true);
    setError(null);
    const outcome = await resetMockAttempts();
    if (outcome.error) {
      setError(outcome.error);
      setResetting(false);
      setConfirmReset(false);
      return;
    }
    // The brief is server-rendered from the rows just deleted.
    window.location.reload();
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button onClick={onStart} className="h-12 px-7 text-[16px]">
          Start the paper
        </Button>
        {history.length > 0 && (
          <Button variant="quiet" onClick={() => setConfirmReset(true)} disabled={resetting}>
            Clear my mock scores
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}

      {/* Clearing the scores deletes every paper sat, so it asks first:
          it used to happen on the tap. */}
      <Confirm
        open={confirmReset}
        title="Clear your mock scores?"
        confirmLabel={`Clear ${history.length} paper${history.length === 1 ? "" : "s"}`}
        cancelLabel="Keep them"
        destructive
        busy={resetting}
        onConfirm={() => void reset()}
        onCancel={() => setConfirmReset(false)}
      >
        Every paper you have sat, and its scores, will be deleted. Your practice
        answers and your plan are not affected.
      </Confirm>

      {history.length > 0 && (
        <ScrollFade as="div" className="mt-12">
          <h2 className="font-display text-[22px] font-semibold text-ink-strong">Your papers</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {history.map((a) => (
              <li key={a.satAt} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:px-5">
                <span className="font-ui text-[15px] font-semibold text-ink-strong">
                  {new Date(a.satAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  <GradeBar percent={a.marked.percent} className="h-1.5" />
                  <span className="mt-1 block font-ui text-[13px] tabular-nums text-ink/65">
                    SBA {a.marked.sbaCorrect}/{a.marked.sbaTotal}, EMQ {a.marked.emqCorrect}/{a.marked.emqTotal}
                  </span>
                </span>
                <span className="flex items-center gap-2.5">
                  <span className="font-display text-[22px] tabular-nums text-ink-strong">{a.marked.percent}%</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-ui text-label font-bold ${
                      a.marked.passed ? "bg-good text-on-brand" : "bg-accent/10 text-accent-ink"
                    }`}
                  >
                    {a.marked.passed ? "Pass" : `Below ${passMark}%`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </ScrollFade>
      )}

      {last && (
        <ScrollFade as="div" className="mt-10">
          <h2 className="font-display text-[22px] font-semibold text-ink-strong">
            Your last paper, section by section
          </h2>
          <p className="mt-1 font-ui text-[15px] text-ink/70">Weakest first: where to revise before the next one.</p>
          <div className="mt-3">
            <SectionScores
              rows={last.sections ?? []}
              passMark={passMark}
              empty="No section scores were recorded for this paper."
            />
          </div>
        </ScrollFade>
      )}
    </>
  );
}

/**
 * A paper's score topic by topic, worst first.
 *
 * The same table at both ends of a sitting: on the brief it is the
 * last paper's, after marking it is this one's. What it reports is
 * performance in the paper, not the rolling topic map, because a mock
 * is the whole syllabus sampled once under the clock and the question
 * at the end of one is "given how that went, what do I revise".
 *
 * The count beside each score is there because three out of four and
 * thirty out of forty are not the same claim, and a mock samples some
 * topics far more thinly than others.
 */
function SectionScores({
  rows,
  passMark,
  empty,
}: {
  rows: SectionScore[];
  passMark: number;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="font-ui text-[16px] leading-relaxed text-ink/65">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {rows.map((row) => (
        <li key={row.section_id} className="px-4 py-3 sm:px-5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-ui text-[15px] text-ink">{row.title}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="font-ui text-[13px] tabular-nums text-ink/65">
                {row.correct}/{row.total}
              </span>
              <span
                className={`font-ui text-[15px] font-semibold tabular-nums ${
                  row.percent >= passMark ? "text-good" : row.percent >= 100 / 3 ? "text-warn" : "text-accent-ink"
                }`}
              >
                {row.percent}%
              </span>
            </span>
          </span>
          <GradeBar percent={row.percent} className="mt-2 h-1" />
        </li>
      ))}
    </ul>
  );
}

function MockBrief({
  shape,
  fullPaper,
  totalSeconds,
  adviceAt,
  passMark,
  history,
  onStart,
}: {
  shape: PaperShape;
  fullPaper: PaperShape;
  totalSeconds: number;
  adviceAt: number | null;
  passMark: number;
  history: MockAttempt[];
  onStart: () => void;
}) {
  const short = shape.sba < fullPaper.sba || shape.emq < fullPaper.emq;
  const minutes = Math.round(totalSeconds / 60);
  const sbaMinutes = adviceAt !== null ? Math.round(adviceAt / 60) : null;

  /*
    The start of a mock, rebuilt at the owner's request: it was one card
    of mono figures and three equal buttons. Now the paper is drawn as
    what it is, two halves weighted 40 and 60 with the time on it, the
    rules are four short lines rather than a paragraph behind an (i),
    and the papers already sat are below, each with its mark.
  */
  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold leading-[1.12] text-ink-strong [font-variation-settings:'opsz'_60] sm:text-[40px]">
        Mock exam
      </h1>
      <Trace className="mt-3 h-5 w-44" />
      <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/75">
        A full paper under exam conditions, marked only when you hand it in.
      </p>

      <ScrollFade as="div" className="mt-8 overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="grid sm:grid-cols-[2fr_3fr]">
          <div className="border-b border-line p-5 sm:border-b-0 sm:border-r sm:p-6">
            <p className="font-ui text-[14px] font-semibold text-ink/70">Single best answers</p>
            <p className="mt-1 font-display text-[40px] leading-none tabular-nums text-ink-strong">{shape.sba}</p>
            <p className="mt-2 font-ui text-[15px] text-ink/75">
              40% of the mark
              {sbaMinutes !== null && <>, about {sbaMinutes} minutes</>}
            </p>
          </div>
          <div className="p-5 sm:p-6">
            <p className="font-ui text-[14px] font-semibold text-ink/70">Extended matching sets</p>
            <p className="mt-1 font-display text-[40px] leading-none tabular-nums text-ink-strong">{shape.emq}</p>
            <p className="mt-2 font-ui text-[15px] text-ink/75">60% of the mark, each scenario marked on its own</p>
          </div>
        </div>
        {/* The weighting, drawn: forty and sixty of one bar. */}
        <div className="flex h-2" aria-hidden="true">
          <span className="bar-grow h-full w-[40%] bg-accent/70" />
          <span className="bar-grow h-full w-[60%] bg-good/80 [animation-delay:200ms]" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-6">
          <span className="inline-flex items-center gap-2 font-ui text-[16px] font-semibold text-ink-strong">
            <svg viewBox="0 0 20 20" className="h-5 w-5 text-good" aria-hidden="true">
              <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10 5.5V10l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            {minutes} minutes
          </span>
          <span className="font-ui text-[15px] text-ink/75">
            Pass mark <span className="font-semibold text-ink-strong">{passMark}%</span>
          </span>
        </div>
      </ScrollFade>

      {short && (
        <Banner tone="warn" className="mt-4">
          A full paper is {fullPaper.sba} SBAs and {fullPaper.emq} EMQs. The bank
          cannot fill one yet, so this is a shortened paper, marked and timed on
          the same scale, but not the same length.
        </Banner>
      )}

      <ScrollFade as="div">
        <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {[
            "The clock runs from the start and the paper is handed in when it stops.",
            "Move freely between questions and flag any to come back to.",
            "Nothing is marked until you hand it in, then every answer is explained.",
            "Unanswered questions count as wrong, as they do in the hall.",
          ].map((rule) => (
            <li key={rule} className="flex gap-3 font-ui text-[16px] leading-snug text-ink/80">
              <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-good" aria-hidden="true">
                <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {rule}
            </li>
          ))}
        </ul>
      </ScrollFade>

      <MockBriefActions passMark={passMark} history={history} onStart={onStart} />
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
      <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <p className="font-ui text-[14px] font-semibold text-good">
          EMQ set: {item.scenarios.length} scenarios sharing one option list
        </p>
        {item.leadIn && (
          <LeadIn
            text={item.leadIn}
            className="mt-3 whitespace-pre-wrap font-ui text-[16px] leading-relaxed text-ink/80"
          />
        )}
        <ol className="mt-4 space-y-1 rounded-card border border-line bg-raised/60 p-4">
          {item.options.map((o) => (
            <li key={o.key} className="flex gap-2.5 text-sm text-ink/85">
              <span className="font-mono text-xs leading-5 text-ink/65">
                {o.key}
              </span>
              <span>{o.text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 space-y-5">
          {item.scenarios.map((s, n) => (
            <div key={s.id} className="border-t border-line pt-4">
              <p className="font-ui text-[14px] font-semibold text-good">
                Scenario {n + 1} of {item.scenarios.length}
              </p>
              <p className="mt-2 whitespace-pre-wrap font-display text-reading leading-relaxed text-ink">
                {s.stem}
              </p>
              <label htmlFor={`mock-${s.id}`} className="sr-only">
                Answer for scenario {n + 1}
              </label>
              <select
                id={`mock-${s.id}`}
                value={answers[s.id] ?? ""}
                onChange={(e) => onAnswer(s.id, e.target.value)}
                className="mt-3 w-full rounded-card border border-line bg-raised px-3 py-2.5 text-sm text-ink focus:border-good focus:outline-none focus:ring-1 focus:ring-good"
              >
                <option value="" disabled>
                  Choose from the option list…
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
    <article className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <p className="font-ui text-[14px] font-semibold text-good">
        SBA
      </p>
      <p className="mt-3 whitespace-pre-wrap font-display text-reading leading-relaxed text-ink">
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
                    ? "border-good bg-sunk"
                    : "border-line bg-raised hover:border-good hover:bg-sunk"
                }`}
              >
                <span className="font-mono text-xs leading-5 text-ink/65">
                  {o.key}
                </span>
                <span className="text-ink">{o.text}</span>
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
    <div className="mt-6 rounded-card border border-line bg-surface p-4">
      <p className="font-ui text-[14px] font-semibold text-ink/65">
        Paper
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((it, i) => {
          const ids = itemIds(it);
          const answeredHere = ids.filter((id) => answers[id]).length;
          const done = answeredHere === ids.length;
          const part = answeredHere > 0 && !done;
          const flagged = flags.has(it.key);
          /* A set partly answered is split corner to corner, green
             above the diagonal and empty below, at the owner's request:
             an EMQ set is one box but several answers, so "answered"
             and "not answered" cannot describe it, and the diagonal
             reads as "begun, not finished" at a glance. */
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onGo(i)}
              aria-current={i === current ? "true" : undefined}
              title={`${
                it.kind === "emq_set"
                  ? `EMQ set, ${answeredHere} of ${ids.length} answered`
                  : "SBA"
              }${flagged ? ", flagged" : ""}`}
              // A flag outranks the answered colour: it is the thing the
              // candidate asked to be reminded of.
              style={
                part && i !== current && !flagged
                  ? {
                      backgroundImage:
                        "linear-gradient(to bottom right, rgb(var(--c-good) / 0.35) 50%, transparent 50%)",
                    }
                  : undefined
              }
              className={`relative h-7 min-w-7 rounded border px-1.5 font-mono text-label ${
                i === current
                  ? "border-brand bg-brand text-on-brand"
                  : flagged
                    ? "border-warn bg-warn/15 text-warn"
                    : done
                      ? "border-good bg-sunk text-good"
                      : part
                        ? "border-good/50 bg-raised text-ink/70"
                        : "border-line bg-raised text-ink/65"
              }`}
            >
              {i + 1}
              {it.kind === "emq_set" ? "*" : ""}
              {flagged && (
                <span
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-warn"
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-label text-ink/65">
        * an EMQ set. Green answered, split part answered, amber flagged,
        grey untouched.
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
  breakdown,
  onBack,
}: {
  marked: MarkedPaper;
  items: QuestionItem<SessionQuestion>[];
  answers: Record<number, string>;
  wrongIds: Set<number>;
  breakdown: SectionScore[];
  /** Back to the mock's own page with a fresh paper. */
  onBack: () => void;
}) {
  return (
    <div>
      <div
        className={`rounded-card border p-6 text-center shadow-card ${
          marked.passed
            ? "border-good bg-sunk"
            : "border-accent bg-accent/10"
        }`}
      >
        <p className="font-ui text-[15px] font-semibold text-ink/65">
          Result
          <Explain label="the result">
            {marked.passMark}% or above is a pass here, which is the mark the
            exam asks for. The two halves do not count equally: 40% of the
            mark rides on the SBAs and 60% on the EMQs, whatever the paper
            held of each.
          </Explain>
        </p>
        <p
          className={`mt-1 font-display text-4xl font-semibold ${
            marked.passed ? "text-good" : "text-accent-ink"
          }`}
        >
          {marked.passed ? "Pass" : "Fail"}
        </p>
        <p className="mt-2 font-display text-2xl font-semibold text-ink-strong">
          {marked.percent}%
        </p>

        {/* The two halves, each read along one line: label, then
            figure, the way it would be said aloud. Stacked, the label
            was a caption over a number and the eye had to go down and
            back for each of them. */}
        <div className="mt-5 flex flex-wrap items-baseline justify-center gap-x-10 gap-y-3">
          <p className="flex items-baseline gap-2">
            <span className="font-ui text-reading font-semibold text-ink/70">
              SBA
              <Explain label="the SBA half">
                Forty per cent of the mark, however many SBAs the paper held.
                One question, one answer, one mark.
              </Explain>
            </span>
            <span className="font-mono text-figure font-bold leading-none text-ink-strong">
              {marked.sbaCorrect}
              <span className="text-reading font-normal text-ink/65">
                /{marked.sbaTotal}
              </span>
            </span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="font-ui text-reading font-semibold text-ink/70">
              EMQ
              <Explain label="the EMQ half">
                Sixty per cent of the mark, counted in sets. A set is one
                question however many scenarios sit under it, and it earns the
                fraction of itself you answered correctly, so three right out
                of four is three quarters of a set rather than nothing.
              </Explain>
            </span>
            <span className="font-mono text-figure font-bold leading-none text-ink-strong">
              {marked.emqCorrect}
              <span className="text-reading font-normal text-ink/65">
                /{marked.emqTotal}
              </span>
            </span>
          </p>
        </div>
      </div>

      {/* A way back to the top of the mock, at the top. The only one
          was beneath a hundred reviewed questions, which is a long
          scroll to reach the thing most people want next. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {/* A link to /mock went nowhere: this page IS /mock, and the
            results are this component's state, so following it changed
            nothing. The parent resets to the brief and fetches a fresh
            paper and the updated history. */}
        <Button onClick={onBack}>Back to mock</Button>
        <Link
          href="/"
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
        >
          Back to today
        </Link>
      </div>

      {/* What to revise, before the hundred questions it is drawn
          from. The review below answers "why was that wrong"; this
          answers "what do I do about it", which is the question
          someone closing a mock actually has. */}
      <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="font-display text-[21px] font-semibold leading-snug text-ink-strong">
          What to revise
          <Explain label="what to revise">
            Every topic this paper touched, weakest first, scored on the
            questions it asked rather than on your rolling average. The count
            beside each is how many of that topic the paper held, because
            three out of four and thirty out of forty are not the same claim.
          </Explain>
        </h2>
        <div className="mt-3">
          <SectionScores
            rows={breakdown}
            passMark={marked.passMark}
            empty="No topics to report."
          />
        </div>
      </div>

      <h2 className="mt-8 font-display text-[21px] font-semibold leading-snug text-ink-strong">
        Every question, with its answer
      </h2>

      <div className="mt-4 space-y-4">
        {items.map((item) =>
          item.kind === "emq_set" ? (
            <article
              key={item.key}
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <p className="font-ui text-[14px] font-semibold text-good">
                EMQ set
              </p>
              {item.leadIn && (
                <LeadIn
                  text={item.leadIn}
                  className="mt-2 font-ui text-[16px] leading-relaxed text-ink/75"
                />
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
              className="rounded-card border border-line bg-surface p-5 shadow-card"
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
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
        >
          See your progress
        </Link>
        <Link
          href="/mock"
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
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
    <div className="mt-4 border-t border-line pt-4 first:mt-0 first:border-0 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="font-ui text-[14px] font-semibold text-good">
          {label}
        </span>
        <span
          className={`font-ui text-[14px] font-semibold ${
            wrong ? "text-accent-ink" : "text-good"
          }`}
        >
          {wrong ? (chosen ? "Incorrect" : "Not answered") : "Correct"}
        </span>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {question.stem}
      </p>
      <QuestionFigure figure={question.figure} placement="stem" />

      <p className="mt-3 rounded-card border border-good bg-sunk px-3 py-2 text-sm">
        <span className="font-mono text-xs text-ink/65">Answer</span>{" "}
        <span className="font-mono text-xs">{correct?.key}</span>{" "}
        {correct?.text}
      </p>
      {wrong && chosen && (
        <p className="mt-1.5 rounded-card border border-accent/50 bg-accent/10 px-3 py-2 text-sm">
          <span className="font-mono text-xs text-ink/65">You chose</span>{" "}
          <span className="font-mono text-xs">{picked?.key}</span>{" "}
          {picked?.text}
        </p>
      )}

      {explanation && (
        <p className="mt-3 whitespace-pre-line font-ui text-[16px] leading-relaxed text-ink/85">
          {explanation}
        </p>
      )}

      {question.explanation_table && (
        <ExplanationTable table={question.explanation_table} />
      )}
      <QuestionFigure figure={question.figure} placement="explanation" />

      {question.sources.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {question.sources.map((s, i) => (
            <li key={i} className="text-label text-ink/65">
              <span className="font-medium text-ink/70">{s.title}</span>
              {formatReference(s) && <span>. {formatReference(s)}</span>}
            </li>
          ))}
        </ul>
      )}
      <ReportQuestion questionId={question.id} />
    </div>
  );
}
