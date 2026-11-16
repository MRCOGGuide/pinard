"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WEEKLY_HOURS, DEFAULT_DAILY, dailyQuestionsFor } from "@/lib/confidence";
import { saveStudyHours } from "@/app/onboarding/actions";

/**
 * Weekly study time and the topic ratings, after onboarding (owner,
 * 16 November 2026). Changing either rebuilds the plan on its next view.
 */
export function StudySettings({ hours, rated }: { hours: number | null; rated: number }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<number | null>(hours);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(value: number) {
    if (value === chosen) return;
    const before = chosen;
    setChosen(value);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveStudyHours(value);
      if (result.error) {
        setChosen(before);
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const daily = chosen ? dailyQuestionsFor(chosen) : DEFAULT_DAILY;

  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="font-ui text-[14px] font-semibold text-ink/70">Your study time</h2>
      <p className="mt-1 font-ui text-[16px] text-ink/80">
        {chosen ? `About ${daily} questions a day.` : `Not set, so your plan asks ${DEFAULT_DAILY} questions a day.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Hours a week">
        {WEEKLY_HOURS.map((w) => (
          <button
            key={w.hours}
            type="button"
            disabled={pending}
            aria-pressed={chosen === w.hours}
            onClick={() => choose(w.hours)}
            className={`inline-flex h-10 items-center rounded-full border px-4 font-ui text-[15px] font-medium ${
              chosen === w.hours ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink/75 hover:text-ink-strong"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 font-ui text-[15px] text-accent-ink">{error}</p>}
      {saved && !error && <p className="ed-reveal mt-3 font-ui text-[14px] text-good">Saved: your plan is rebuilt around it.</p>}

      <h2 className="mt-6 font-ui text-[14px] font-semibold text-ink/70">Your topics</h2>
      <p className="mt-1 font-ui text-[16px] text-ink/80">
        {rated > 0
          ? `You have rated ${rated} topic${rated === 1 ? "" : "s"}. Your answers take over as you go.`
          : "Tell your plan which topics you feel sure of, and it starts with the rest."}
      </p>
      <Link
        href="/?rate=1"
        className="btn-motion mt-3 inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
      >
        {rated > 0 ? "Change my ratings" : "Rate my topics"}
      </Link>
    </div>
  );
}
