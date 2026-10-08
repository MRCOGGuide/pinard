"use client";

import { Explain } from "@/components/Explain";
import { useState, useEffect } from "react";
import { ThinkingTrace } from "@/components/Trace";
import { AnswerText } from "@/components/AnswerText";
import { AnswerDisclaimer } from "@/components/AnswerDisclaimer";
import { buttonClass, FIELD_CLASS } from "@/components/ui";
import { askLibrary } from "@/app/actions";
import {
  ASK_TOPUP_PRICE_PENCE,
  ASK_TOPUP_QUESTIONS,
  type AskAllowance,
} from "@/lib/askAllowance";
import {
  CHAT_MESSAGE_LIMIT,
  stripCitations,
  type ChatMessage,
  type ChatSource,
} from "@/lib/chat";

/**
 * The Ask box on Today: any revision question, answered briefly from
 * every uploaded document, with the guidance it came from printed
 * underneath.
 *
 * One answer at a time on screen. The box stays at the top and the
 * latest answer sits below it, so asking the next thing is always the
 * same gesture in the same place — a lookup, not a transcript growing
 * down the page. The last three exchanges still travel with the
 * question, invisibly, so "and in twins?" knows what it is asking
 * about.
 *
 * Distinct from AskPinard, which sits under a question card, is
 * anchored to that question, and shows its thread.
 */

/**
 * One at a time, rolling.
 *
 * Three chips in a row read as three buttons to choose between, which
 * is a decision before a candidate has even asked anything. One
 * question, offered and withdrawn, reads as a suggestion — and it can
 * show the long kind of question this box answers best without a row
 * of them crowding the box.
 */
const EXAMPLES = [
  "What is the management of sickle cell disease in pregnancy?",
  "Success rate of VBAC?",
  "Risk of uterine rupture with a previous caesarean?",
  "When is anti-D given after a sensitising event?",
  "How is epilepsy managed in pregnancy?",
];

/** Long enough to read and consider, short enough not to wait on. */
const EXAMPLE_MS = 5200;

type Answer = { reply: string; sources: ChatSource[] };

export function AskLibrary({ allowance }: { allowance: AskAllowance }) {
  const [left, setLeft] = useState(allowance);
  const [answer, setAnswer] = useState<Answer | null>(null);
  /*
    Which suggestion is showing. Paused while an answer is on screen or
    one is being fetched, since the chips are not rendered then and a
    timer ticking behind them would land on a different question than
    the one the reader last saw.
  */
  const [example, setExample] = useState(0);

  // Kept but never rendered: only the latest answer is shown, while the
  // last few exchanges travel with the next question so a follow-up
  // knows what it is about.
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only while the suggestion is on screen: it is not rendered beside
    // an answer, and a timer running behind one would land somewhere
    // the reader never saw it arrive.
    if (answer || sending) return;
    const timer = window.setInterval(
      () => setExample((n) => (n + 1) % EXAMPLES.length),
      EXAMPLE_MS
    );
    return () => window.clearInterval(timer);
  }, [answer, sending]);

  async function ask(question: string) {
    const message = question.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    // The previous answer goes as the next question is asked: leaving
    // it under a new question would read as its answer.
    setAnswer(null);
    setDraft("");

    const result = await askLibrary({ message, history: thread });
    setSending(false);

    if (result.error || !result.reply) {
      setDraft(message);
      if (result.allowance) setLeft(result.allowance);
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }

    if (result.allowance) setLeft(result.allowance);
    setAnswer({ reply: result.reply, sources: result.sources ?? [] });
    setThread((t) =>
      [
        ...t,
        { role: "user" as const, content: message },
        { role: "assistant" as const, content: result.reply as string },
      ].slice(-6)
    );
  }

  return (
    <section className="mt-8 rounded-card border border-line bg-surface p-6 shadow-card">
      {/* What this box is, and how to work it, moved behind the (i).
          Both lines were true and both were read once: a sentence
          explaining the box sat above it every day, and a keyboard
          hint sat under the button every day. The heading plus a
          placeholder already say what to do. */}
      <h2 className="font-display text-[22px] font-semibold leading-snug text-ink-strong">
        Ask Pinard
        <Explain label="Ask Pinard">
          Any revision question, answered from the guidelines in your library
          and nowhere else, with every guideline it used listed underneath.
          Press Enter to send, or Shift and Enter together for a new line.
        </Explain>
      </h2>

      <div className="mt-4">
        <label htmlFor="ask-library" className="sr-only">
          Ask Pinard a revision question
        </label>
        <textarea
          id="ask-library"
          rows={2}
          value={draft}
          maxLength={CHAT_MESSAGE_LIMIT}
          disabled={sending || left.remaining <= 0}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          placeholder="Success rate of VBAC?"
          className={`resize-y ${FIELD_CLASS}`}
        />
        <div className="mt-3 flex">
          <button
            type="button"
            onClick={() => void ask(draft)}
            disabled={sending || draft.trim() === "" || left.remaining <= 0}
            className={buttonClass("primary", "md", "px-7")}
          >
            {sending ? "Asking…" : "Ask"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 font-ui text-[15px] text-accent-ink">
          {error}
        </p>
      )}

      <TopUpOffer allowance={left} />

      {sending && <ThinkingTrace className="mt-5" />}

      {answer && !sending && (
        <div className="ed-reveal mt-5 border-t border-line pt-4" aria-live="polite">
          <AnswerText text={stripCitations(answer.reply)} />
          {answer.sources.length > 0 && (
            <ul className="mt-3 space-y-0.5">
              {answer.sources.map((source) => (
                <li
                  key={source.chunk_id}
                  className="font-ui text-[14px] leading-relaxed text-ink/60"
                >
                  <span className="font-medium text-ink/70">
                    {source.title}
                  </span>
                  {source.reference && <span>. {source.reference}</span>}
                </li>
              ))}
            </ul>
          )}
          <AnswerDisclaimer className="mt-3" />
        </div>
      )}

      {!answer && !sending && (
        <div className="mt-4 flex h-9 items-center justify-center overflow-hidden">
          <button
            key={example}
            type="button"
            onClick={() => void ask(EXAMPLES[example])}
            className="example-roll rounded-full border border-line bg-raised px-3 py-1 text-xs text-ink/70 hover:border-good hover:text-ink-strong"
          >
            {EXAMPLES[example]}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * How many questions are left, and the way to buy more.
 *
 * Silent for almost everyone: at a hundred a month, a candidate asking
 * a few questions a day never sees it. It appears only near the limit,
 * so the offer arrives before the feature stops rather than after.
 */
function TopUpOffer({ allowance }: { allowance: AskAllowance }) {
  if (allowance.unlimited || !allowance.offerTopUp) return null;

  const out = allowance.remaining <= 0;
  const price = `£${(ASK_TOPUP_PRICE_PENCE / 100).toFixed(2)}`;

  return (
    <div
      className={`mt-4 rounded-control border p-4 ${
        out ? "border-accent/40 bg-accent/5" : "border-line bg-sunk"
      }`}
    >
      <p className="font-ui text-[15px] font-semibold text-ink-strong">
        {out
          ? "You have used this month's Ask Pinard questions."
          : `${allowance.remaining} Ask Pinard ${
              allowance.remaining === 1 ? "question" : "questions"
            } left this month.`}
      </p>
      <p className="mt-1 font-ui text-[14px] leading-relaxed text-ink/70">
        Add {ASK_TOPUP_QUESTIONS} more for {price}. They carry over for as long
        as you stay subscribed, renewals included
        {out ? "" : ", and your monthly allowance still resets on the 1st"}.
      </p>
      <form action="/api/stripe/ask-topup" method="post" className="mt-3">
        <button type="submit" className={buttonClass(out ? "primary" : "secondary", "sm")}>
          Add {ASK_TOPUP_QUESTIONS} questions: {price}
        </button>
      </form>
    </div>
  );
}
