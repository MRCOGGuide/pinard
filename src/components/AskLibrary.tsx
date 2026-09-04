"use client";

import { useState } from "react";
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

const EXAMPLES = [
  "Success rate of VBAC?",
  "Risk of uterine rupture with a previous caesarean?",
  "When is anti-D given after a sensitising event?",
];

type Answer = { reply: string; sources: ChatSource[] };

export function AskLibrary({ allowance }: { allowance: AskAllowance }) {
  const [left, setLeft] = useState(allowance);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Kept but never rendered: only the latest answer is shown, while the
  // last few exchanges travel with the next question so a follow-up
  // knows what it is about.
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className="mt-4 rounded-card border border-hairline bg-porcelain p-6 shadow-card">
      {/* Centred: this is a box you walk up to and ask something, so it
          reads as an invitation rather than another column of prose.
          The answer below stays left-aligned — centred paragraphs are
          hard to read. */}
      <h2 className="text-center font-display text-lg font-semibold text-theatre">
        Ask Pinard
      </h2>
      <p className="mt-1 text-center text-sm leading-relaxed text-graphite/80">
        Any question, answered briefly from the source material.
      </p>

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
          className="w-full resize-y rounded-card border border-hairline bg-white px-3 py-2 text-sm text-graphite placeholder:text-graphite/40 focus:border-greentop focus:outline-none focus:ring-1 focus:ring-greentop disabled:opacity-60"
        />
        {/* Stacked, not side by side: the hint beside the button pushes
            the button itself off centre. */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => void ask(draft)}
            disabled={sending || draft.trim() === "" || left.remaining <= 0}
            className="rounded-card bg-theatre px-6 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
          >
            {sending ? "Asking…" : "Ask"}
          </button>
          <span className="hidden font-mono text-[11px] text-graphite/45 sm:inline">
            Enter to send · Shift+Enter for a new line
          </span>
        </div>
      </div>

      {error && <p className="mt-4 text-center text-sm text-heartbeat">{error}</p>}

      <TopUpOffer allowance={left} />

      {sending && (
        <p className="mt-4 text-center font-mono text-[11px] text-graphite/50">
          Thinking…
        </p>
      )}

      {answer && !sending && (
        <div className="mt-5 border-t border-hairline pt-4" aria-live="polite">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-graphite/85">
            {stripCitations(answer.reply)}
          </p>
          {answer.sources.length > 0 && (
            <ul className="mt-3 space-y-0.5">
              {answer.sources.map((source) => (
                <li
                  key={source.chunk_id}
                  className="text-[11px] leading-relaxed text-graphite/55"
                >
                  <span className="font-medium text-graphite/70">
                    {source.title}
                  </span>
                  {source.reference && <span> · {source.reference}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!answer && !sending && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => void ask(example)}
              className="rounded-full border border-hairline bg-white px-3 py-1 text-xs text-graphite/70 hover:border-greentop hover:text-theatre"
            >
              {example}
            </button>
          ))}
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
      className={`mt-4 rounded-card border p-4 text-center ${
        out ? "border-heartbeat/40 bg-white" : "border-hairline bg-white/60"
      }`}
    >
      <p className="text-sm text-graphite/85">
        {out
          ? "You have used this month's Ask Pinard questions."
          : `${allowance.remaining} Ask Pinard ${
              allowance.remaining === 1 ? "question" : "questions"
            } left this month.`}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-graphite/60">
        Add {ASK_TOPUP_QUESTIONS} more for {price}. They carry over for as long
        as you stay subscribed, renewals included
        {out ? "" : ", and your monthly allowance still resets on the 1st"}.
      </p>
      <form action="/api/stripe/ask-topup" method="post" className="mt-3">
        <button
          type="submit"
          className="rounded-card bg-theatre px-5 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Add {ASK_TOPUP_QUESTIONS} questions — {price}
        </button>
      </form>
    </div>
  );
}
