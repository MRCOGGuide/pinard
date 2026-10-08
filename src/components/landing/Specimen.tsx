"use client";

import Link from "next/link";
import { useState } from "react";
import type { ShowcaseSba } from "@/lib/showcase";

/**
 * One real question from the bank, answerable on the landing page.
 *
 * The product is bought on the quality of its questions and their
 * explanations, and the honest way to show that is to let a visitor
 * answer one: pick an option and the verdict, the explanation and the
 * guideline it came from appear underneath, exactly as they do in a
 * session.
 */
export function Specimen({ sba, more }: { sba: ShowcaseSba; more: string }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const answered = chosen !== null;
  const right = chosen === sba.correct;

  return (
    <figure className="rounded-[14px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
      <figcaption className="font-ui text-[14px] text-ink/60">
        <span className="font-semibold text-ink-strong">Single best answer</span>
        <span className="ml-3">From the bank</span>
      </figcaption>

      <p className="reading mt-3 !text-[17px] text-ink">{sba.stem}</p>

      <ul className="mt-4 space-y-2" aria-label="Options">
        {sba.options.map((o) => {
          const isChosen = chosen === o.key;
          const isCorrect = o.key === sba.correct;
          let row = "border-line hover:border-good/60";
          let letter = "border-line text-ink/60";
          if (answered && isCorrect) {
            row = "border-good bg-good/10";
            letter = "border-good bg-good text-on-brand";
          } else if (answered && isChosen) {
            row = "border-accent bg-accent/10";
            letter = "border-accent bg-accent text-on-brand";
          } else if (answered) {
            row = "border-line opacity-60";
          }
          return (
            <li key={o.key}>
              <button
                type="button"
                disabled={answered}
                onClick={() => setChosen(o.key)}
                aria-pressed={isChosen}
                className={`flex min-h-11 w-full items-start gap-3 rounded-[10px] border bg-surface px-3.5 py-2.5 text-left font-ui text-[15px] leading-snug transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.995] disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none ${row}`}
              >
                <span
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold ${letter}`}
                >
                  {o.key}
                </span>
                <span className="pt-px text-ink">{o.text}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {!answered ? (
        <p className="mt-3 font-ui text-[14px] text-ink/55">
          Choose an answer to see the explanation.
        </p>
      ) : (
        <div className="ed-reveal mt-5 border-t border-line pt-4" aria-live="polite">
          <p
            className={`font-serif text-[19px] font-semibold ${right ? "text-good" : "text-accent-ink"}`}
          >
            {right ? "Correct." : `The answer is ${sba.correct}.`}
          </p>
          <p className="reading mt-2 !text-[16px] text-ink/90">{sba.explanation}</p>
          {sba.source && (
            <p className="mt-3 font-ui text-[13px] text-ink/60">
              <span className="font-semibold text-ink/80">Source.</span> {sba.source}
            </p>
          )}
          <p className="mt-4">
            <Link
              href="/sample"
              className="font-ui text-[15px] font-semibold text-good underline decoration-good/40 underline-offset-4 hover:decoration-good"
            >
              {more}
            </Link>
          </p>
        </div>
      )}
    </figure>
  );
}
