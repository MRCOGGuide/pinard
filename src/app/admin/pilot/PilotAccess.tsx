"use client";

import { useState, useTransition } from "react";
import { Button, Card, FIELD_CLASS, Toast } from "@/components/ui";
import { setPilotAccessUntil } from "./actions";

/**
 * Until when an invite code gives full access.
 *
 * Everyone who joined with a code has the whole product until the end
 * of this day, whatever BETA_FULL_ACCESS says, so the public launch can
 * switch that off without cutting the assessors off mid-review. Empty
 * means the pilot has no end date yet.
 */
export function PilotAccess({ until }: { until: string | null }) {
  const [value, setValue] = useState(until ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setMsg(null);
    startTransition(async () => {
      const result = await setPilotAccessUntil(next);
      setMsg(
        result.error
          ? { ok: false, text: result.error }
          : { ok: true, text: next ? `Invited candidates have full access until the end of ${next}.` : "No end date: invited candidates keep full access." }
      );
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">Pilot access</h2>
      <Card>
        <p className="text-sm text-ink/80">
          Everyone who joined with an invite code has the full product, without paying, until the end of this day. Leave it
          empty while the pilot has no end date. Public launch can then turn BETA_FULL_ACCESS off without cutting the
          assessors off.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`max-w-[12rem] ${FIELD_CLASS}`}
          />
          <Button onClick={() => save(value)} disabled={pending}>
            Save
          </Button>
          {value && (
            <Button
              variant="quiet"
              onClick={() => {
                setValue("");
                save("");
              }}
              disabled={pending}
            >
              No end date
            </Button>
          )}
        </div>
        {msg && <Toast tone={msg.ok ? "good" : "bad"} className="mt-3">{msg.text}</Toast>}
      </Card>
    </section>
  );
}
