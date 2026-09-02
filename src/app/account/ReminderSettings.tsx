"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveReminderSettings } from "./actions";

/**
 * When the daily reminder arrives, and whether it arrives at all.
 *
 * Times are UK — this audience sits UK exams — and the hour is a
 * choice rather than a free field: a reminder is useful before a shift
 * or after one, not at 14:37.
 */

const HOURS = [5, 6, 7, 8, 9, 12, 17, 18, 19, 20, 21];

function label(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${hour < 12 ? "am" : "pm"}`;
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

  function save(next: { enabled: boolean; hour: number }) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveReminderSettings(next);
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
    <div className="mt-4 rounded-card border border-hairline bg-porcelain p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold text-theatre">
        Daily reminder
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-graphite/80">
        One email a day with today&rsquo;s topics, your question target and
        roughly how long it will take. Nothing else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-graphite">
          <input
            type="checkbox"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              setOn(e.target.checked);
              save({ enabled: e.target.checked, hour: when });
            }}
            className="h-4 w-4 rounded border-hairline text-theatre focus:ring-greentop"
          />
          Send me a daily reminder
        </label>

        <label className="flex items-center gap-2 text-sm text-graphite/80">
          <span>at</span>
          <select
            value={when}
            disabled={pending || !on}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWhen(next);
              save({ enabled: on, hour: next });
            }}
            className="rounded-card border border-hairline bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {label(h)}
              </option>
            ))}
          </select>
          <span className="font-mono text-[11px] text-graphite/50">UK time</span>
        </label>
      </div>

      {pending && (
        <p className="mt-3 font-mono text-[11px] text-graphite/50">Saving…</p>
      )}
      {saved && !pending && (
        <p className="mt-3 text-sm text-greentop">Saved.</p>
      )}
      {error && <p className="mt-3 text-sm text-heartbeat">{error}</p>}
    </div>
  );
}
