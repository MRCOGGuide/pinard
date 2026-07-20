"use client";

import { useTransition } from "react";
import type { ExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { setExamLive } from "./actions";

/**
 * Which exam parts candidates can see and onboard onto. Admins always
 * see every part regardless of these switches.
 */
export function ExamVisibility({
  availability,
}: {
  availability: ExamAvailability;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-card border border-hairline bg-porcelain p-4 shadow-card">
      <h2 className="font-display text-base font-semibold text-theatre">
        Visible to candidates
      </h2>
      <p className="mt-0.5 text-xs text-graphite/60">
        Switch a part on when its content is ready. Hidden parts stay fully
        editable here in the admin area.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(EXAM_LABELS) as ExamPart[]).map((part) => {
          const live = availability[part];
          return (
            <button
              key={part}
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setExamLive(part, !live);
                })
              }
              aria-pressed={live}
              className={`rounded-card border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                live
                  ? "border-greentop bg-sage text-greentop"
                  : "border-hairline bg-white text-graphite/50 hover:text-theatre"
              }`}
            >
              {EXAM_LABELS[part]}
              <span className="ml-2 font-mono text-[10px] uppercase">
                {live ? "live" : "hidden"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
