"use client";

import { useEffect, useRef, useState } from "react";
import { ThinkingTrace } from "@/components/Trace";
import { askPinard, getChatHistory } from "@/app/session/actions";
import {
  CHAT_MESSAGE_LIMIT,
  CHAT_TURN_LIMIT,
  stripCitations,
  type ChatTurn,
} from "@/lib/chat";

/**
 * "Ask Pinard about this question" — the follow-up tutor chat under a
 * revealed card (PROJECT.md item 7, prompt C).
 *
 * Closed until asked for: most questions need no follow-up, and a chat
 * box sitting open under every card would compete with the explanation
 * for attention. The thread is kept per question, so a question met
 * again in revision brings its conversation back with it.
 */
export function AskPinard({ questionId }: { questionId: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The thread is only worth fetching once someone opens the panel.
  useEffect(() => {
    if (!open || loaded) return;
    let live = true;
    getChatHistory(questionId)
      .then((history) => {
        if (live) setTurns(history);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [open, loaded, questionId]);

  async function send() {
    const message = draft.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    // Show the question immediately; put it back in the box if the
    // answer never arrives, so nothing typed is lost.
    setTurns((t) => [...t, { role: "user", content: message, sources: [] }]);
    setDraft("");

    const result = await askPinard({ questionId, message });
    setSending(false);

    if (result.error || !result.reply) {
      setTurns((t) => t.slice(0, -1));
      setDraft(message);
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }

    setTurns((t) => [
      ...t,
      {
        role: "assistant",
        content: result.reply as string,
        sources: result.sources ?? [],
      },
    ]);
    if (result.flagged) setFlagged(true);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // The panel exists to be typed in.
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="mt-4 rounded-card border border-line bg-raised/60 px-4 py-2 text-sm font-medium text-ink/75 hover:border-good hover:text-ink-strong"
      >
        Ask Pinard about this question
      </button>
    );
  }

  const full = turns.length >= CHAT_TURN_LIMIT;

  return (
    <section className="mt-4 rounded-card border border-line bg-raised/60 p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wide text-good">
          Ask Pinard
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[11px] text-ink/50 hover:text-ink-strong"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-3" aria-live="polite">
        {turns.length === 0 && loaded && (
          <p className="text-sm text-ink/60">
            Ask why an option is wrong, or what the guidance says about a
            related point. Answers come only from the source material.
          </p>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="rounded-card bg-sunk px-3 py-2">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                You
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
                {turn.content}
              </p>
            </div>
          ) : (
            <div key={i} className="px-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-ink/50">
                Pinard
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                {stripCitations(turn.content)}
              </p>
              {turn.sources.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {turn.sources.map((source) => (
                    <li
                      key={source.chunk_id}
                      className="text-[11px] leading-relaxed text-ink/55"
                    >
                      <span className="font-medium text-ink/70">
                        {source.title}
                      </span>
                      {source.reference && <span> · {source.reference}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        )}

        {sending && <ThinkingTrace className="px-1" />}
      </div>

      {flagged && (
        <p className="mt-3 rounded-card border border-accent/30 bg-accent/5 px-3 py-2 text-sm text-ink/80">
          You have found a genuine inconsistency in this question. It has been
          flagged for review.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}

      {full ? (
        <p className="mt-3 font-mono text-[11px] text-ink/50">
          That is the limit for this question.
        </p>
      ) : (
        <div className="mt-3">
          <label htmlFor={`ask-${questionId}`} className="sr-only">
            Ask Pinard about this question
          </label>
          <textarea
            id={`ask-${questionId}`}
            ref={inputRef}
            rows={2}
            value={draft}
            maxLength={CHAT_MESSAGE_LIMIT}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Why is B wrong?"
            className="w-full resize-y rounded-card border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-good focus:outline-none focus:ring-1 focus:ring-good disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || draft.trim() === ""}
              className="rounded-card bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-good disabled:opacity-40"
            >
              {sending ? "Asking…" : "Ask"}
            </button>
            {/* Keyboard hint is for keyboards: on a phone it wraps to
                three lines beside the button and says nothing useful. */}
            <span className="hidden font-mono text-[11px] text-ink/45 sm:inline">
              Enter to send · Shift+Enter for a new line
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
