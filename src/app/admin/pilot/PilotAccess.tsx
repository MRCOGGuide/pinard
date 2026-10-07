"use client";

import { useState, useTransition } from "react";
import { Button, Card, FIELD_CLASS, Toast } from "@/components/ui";
import { setPilotWindow } from "./actions";

/**
 * When the pilot starts and ends, set and changed here.
 *
 * Everyone who joined with an invite code has the full product, without
 * paying, from the start of the first day to the end of the last (UK
 * dates). Before the start they see the free tier and a note saying when
 * it begins; after the end, the same with a note that it has ended.
 * Leave a date empty for none: no start date means it is running now,
 * no end date means it runs until one is set. Public launch can then
 * turn BETA_FULL_ACCESS off without cutting the assessors off.
 */
export function PilotAccess({
  from,
  until,
  status,
  invited,
}: {
  from: string | null;
  until: string | null;
  /** Said by the server, which knows today's UK date. */
  status: string;
  invited: number;
}) {
  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(until ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = start !== (from ?? "") || end !== (until ?? "");

  function save(nextStart: string, nextEnd: string) {
    setMsg(null);
    startTransition(async () => {
      const result = await setPilotWindow(nextStart, nextEnd);
      setMsg(result.error ? { ok: false, text: result.error } : { ok: true, text: "Pilot dates saved." });
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Pilot dates</h2>
      <Card>
        <p className="text-sm font-medium text-ink-strong">{status}</p>
        <p className="mt-1 text-sm text-ink/70">
          {invited} {invited === 1 ? "candidate has" : "candidates have"} joined with an invite code. Between these dates
          they have the full product without paying. Leave a date empty for none, and change either whenever you need to.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-ink/80">Starts</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <span className="mt-1 block text-xs text-ink/55">Empty: already running.</span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink/80">Ends (last day)</span>
            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <span className="mt-1 block text-xs text-ink/55">Empty: runs until you set one.</span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => save(start, end)} disabled={pending || !changed}>
            Save dates
          </Button>
          {(start || end) && (
            <Button
              variant="quiet"
              disabled={pending}
              onClick={() => {
                setStart("");
                setEnd("");
                save("", "");
              }}
            >
              Clear both
            </Button>
          )}
        </div>
        {msg && <Toast tone={msg.ok ? "good" : "bad"} className="mt-3">{msg.text}</Toast>}
      </Card>
    </section>
  );
}
