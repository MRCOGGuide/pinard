"use client";

import { useRouter } from "next/navigation";
import { Explain } from "@/components/Explain";
import { useEffect, useState, useTransition } from "react";
import { saveReminderSettings } from "./actions";
import { browserTimezone, zoneLabel } from "@/lib/timezone";

/**
 * When the daily reminder arrives, and whether it arrives at all.
 *
 * The hour is a choice rather than a free field: a reminder is useful
 * before a shift or after one, not at 14:37. Written on a 24-hour
 * clock, which is what a rota is written in and what removes the
 * question of whether "7" means before or after the day.
 *
 * The time is the candidate's own, not London's. More people sit this
 * exam outside the UK than in it, and "07:00" meaning 07:00 in London
 * made it 11:00 in Karachi and 02:00 in Lagos. The browser knows the
 * zone, so it is captured here and sent with the setting rather than
 * asked for.
 */

/*
  Every hour, not a curated eleven.

  The old list offered 05:00-09:00, midday, and 17:00-21:00 — the shape
  of a day shift. This audience works nights: someone coming off a long
  day wants 22:00, someone on nights wants 03:00, and neither was
  offered. There is no cost to the full range, and the assumption behind
  the short one was wrong for a good part of the people using it.
*/
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** 07:00, not 7am. */
function label(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}


export function ReminderSettings({
  enabled,
  hour,
}: {
  enabled: boolean;
  hour: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [when, setWhen] = useState(hour);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /*
    Resolved after mount. The server cannot know the browser's zone, and
    rendering a guess would flash the wrong one — so it starts as the
    honest "your local time" and settles once the client runs.
  */
  const [zone, setZone] = useState("your local time");
  useEffect(() => {
    setZone(zoneLabel(browserTimezone()));
  }, []);

  function save(next: { enabled: boolean; hour: number }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Sent on every save rather than once at onboarding: someone who
      // moves, or who set this up on a laptop in another country, would
      // otherwise keep the zone they first arrived with.
      const result = await saveReminderSettings({ ...next, timezone: browserTimezone() });
      if (result.error) {
        setError(result.error);
        // Put the controls back where the saved settings actually are.
        setOn(enabled);
        setWhen(hour);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="font-display text-[21px] font-semibold leading-snug text-ink-strong">
        Daily reminder
        <Explain label="the daily reminder">
          One email a day with today&rsquo;s topics, your question target and
          roughly how long it will take. Nothing else.
        </Explain>
      </h2>

      {/* One line, read as a sentence: [switch] Send me a daily reminder
          at [07:00] your time. Tight gaps, so it does not read as three
          separate controls spread across the card. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* A switch rather than a checkbox: it says on or off at a
            glance, and the thumb slides across (transform only). */}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={pending}
          onClick={() => {
            const next = !on;
            setOn(next);
            save({ enabled: next, hour: when });
          }}
          className="group inline-flex items-center gap-3 font-ui text-[16px] text-ink disabled:opacity-60"
        >
          <span
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors duration-base ${
              on ? "bg-good" : "bg-line"
            }`}
          >
            <span
              className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-surface shadow-card transition-transform duration-base ease-standard motion-reduce:transition-none"
              style={{ transform: on ? "translateX(20px)" : "none" }}
            />
          </span>
          Send me a daily reminder
        </button>

        <label className="flex items-center gap-2 font-ui text-[16px] text-ink">
          <span>at</span>
          <select
            value={when}
            disabled={pending || !on}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWhen(next);
              save({ enabled: on, hour: next });
            }}
            className="h-9 w-auto rounded-control border border-line bg-raised pl-2 pr-1 font-ui text-[16px] tabular-nums disabled:opacity-50"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
          <span className="font-ui text-[14px] text-ink/65">{zone}</span>
        </label>
      </div>

      {pending && <p className="mt-3 font-ui text-[14px] text-ink/65">Saving…</p>}
      {saved && !pending && <p className="ed-reveal mt-3 font-ui text-[14px] text-good">Saved.</p>}
      {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
    </div>
  );
}
