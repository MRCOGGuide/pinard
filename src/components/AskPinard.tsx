"use client";

import { useEffect, useRef, useState } from "react";
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
        className="mt-4 rounded-card border border-hairline bg-white/60 px-4 py-2 text-sm font-medium text-graphite/75 hover:border-greentop hover:text-theatre"
      >
        Ask Pinard about this question
      </button>
    );
  }

  const full = turns.length >= CHAT_TURN_LIMIT;

  return (
    <section className="mt-4 rounded-card border border-hairline bg-white/60 p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-wide text-greentop">
          Ask Pinard
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="font-mono text-[11px] text-graphite/50 hover:text-theatre"
        >
          Close
        </button>
      </div>

      <div className="mt-3 space-y-3" aria-live="polite">
        {turns.length === 0 && loaded && (
          <p className="text-sm text-graphite/60">
            Ask why an option is wrong, or what the guidance says about a
            related point. Answers come only from the source material.
          </p>
        )}

        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="rounded-card bg-sage px-3 py-2">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                You
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-graphite">
                {turn.content}
              </p>
            </div>
          ) : (
            <div key={i} className="px-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                Pinard
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-graphite/85">
                {stripCitations(turn.content)}
              </p>
              {turn.sources.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {turn.sources.map((source) => (
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
          )
        )}

        {sending && (
          <p className="px-1 font-mono text-[11px] text-graphite/50">
            Thinking…
          </p>
        )}
      </div>

      {flagged && (
        <p className="mt-3 rounded-card border border-heartbeat/30 bg-heartbeat/5 px-3 py-2 text-sm text-graphite/80">
          You have found a genuine inconsistency in this question. It has been
          flagged for review.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}

      {full ? (
        <p className="mt-3 font-mono text-[11px] text-graphite/50">
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
            className="w-full resize-y rounded-card border border-hairline bg-porcelain px-3 py-2 text-sm text-graphite placeholder:text-graphite/40 focus:border-greentop focus:outline-none focus:ring-1 focus:ring-greentop disabled:opacity-60"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || draft.trim() === ""}
              className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop disabled:opacity-40"
            >
              {sending ? "Asking…" : "Ask"}
            </button>
            {/* Keyboard hint is for keyboards: on a phone it wraps to
                three lines beside the button and says nothing useful. */}
            <span className="hidden font-mono text-[11px] text-graphite/45 sm:inline">
              Enter to send · Shift+Enter for a new line
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
