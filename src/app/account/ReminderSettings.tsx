"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { saveReminderSettings } from "./actions";

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

/** What the browser says the zone is — "Europe/London", "Asia/Karachi". */
function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** "Asia/Karachi" reads better as "Karachi", and the offset is what a
 *  candidate actually checks against. */
function zoneLabel(zone: string | undefined): string {
  if (!zone) return "your local time";
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  try {
    const name = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return name ? `${city} · ${name}` : city;
  } catch {
    return city;
  }
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
    setZone(zoneLabel(browserZone()));
  }, []);

  function save(next: { enabled: boolean; hour: number }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // Sent on every save rather than once at onboarding: someone who
      // moves, or who set this up on a laptop in another country, would
      // otherwise keep the zone they first arrived with.
      const result = await saveReminderSettings({ ...next, timezone: browserZone() });
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
      <h2 className="font-display text-lg font-semibold text-ink-strong">
        Daily reminder
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink/80">
        One email a day with today&rsquo;s topics, your question target and
        roughly how long it will take. Nothing else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              setOn(e.target.checked);
              save({ enabled: e.target.checked, hour: when });
            }}
            className="h-4 w-4 rounded border-line text-ink-strong focus:ring-good"
          />
          Send me a daily reminder
        </label>

        <label className="flex items-center gap-2 text-sm text-ink/80">
          <span>at</span>
          <select
            value={when}
            disabled={pending || !on}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWhen(next);
              save({ enabled: on, hour: next });
            }}
            className="rounded-card border border-line bg-raised px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
          <span className="font-mono text-[11px] text-ink/50">{zone}</span>
        </label>
      </div>

      {pending && (
        <p className="mt-3 font-mono text-[11px] text-ink/50">Saving…</p>
      )}
      {saved && !pending && (
        <p className="mt-3 text-sm text-good">Saved.</p>
      )}
      {error && <p className="mt-3 text-sm text-accent-ink">{error}</p>}
    </div>
  );
}
