import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { ButtonLink } from "@/components/ui";
import { SIGN_UP_LABEL } from "@/lib/launch";

export const metadata: Metadata = {
  title: "How Pinard works – MRCOG revision from current guidance",
  description:
    "A fifteen-question diagnostic, a plan weighted to your weakest topics, and SBA and EMQ questions written from current RCOG, NICE and TOG guidance, each approved by a Member of the RCOG.",
};

/**
 * How it works, said plainly for a trainee deciding whether to trust it.
 *
 * Rebuilt in the editorial direction: it was seven identical cards with
 * a highlighted card above and a pink one below, which read as a
 * template. Now one heading and one paragraph per point, on rules, and
 * every claim kept to what the product does (the diagnostic samples
 * fifteen sub-topics, not every topic; explanations cite the passage
 * they rely on, which is checked, rather than "nothing is invented").
 */

const POINTS: { term: string; body: React.ReactNode }[] = [
  {
    term: "Written from the guidance",
    body: (
      <>
        Every SBA and EMQ is written from a named source in Pinard&rsquo;s
        library: RCOG Green-top Guidelines, NICE, TOG reviews, and the
        specialist guidance the paper draws on, such as ESHRE, BSGE and BASHH.
        Each explanation cites the passage it relies on, and a question whose
        citation does not support its answer is discarded.
      </>
    ),
  },
  {
    term: "Approved by Members of the RCOG",
    body: (
      <>
        Nothing reaches you until a Member of the Royal College of
        Obstetricians and Gynaecologists has approved it, on top of the
        automated check that every citation supports its answer.
      </>
    ),
  },
  {
    term: "Refreshed every quarter",
    body: (
      <>
        Guidelines and TOG reviews change. The library is updated every three
        months, superseded guidance is retired, and the questions written from
        it go with it, so you revise from what is current rather than from the
        last edition of a book.
      </>
    ),
  },
  {
    term: "A plan weighted to your weak topics",
    body: (
      <>
        A free fifteen-question diagnostic, five from each module, places you
        against a 70% pass line. Your plan then gives the topics below 70% more
        time the further below they sit, brings secure topics back on a spaced
        schedule, and turns into mixed papers in the final fortnight. It
        rebuilds as your scores move or your exam date changes, and Pinard&rsquo;s
        AI writes you a short briefing on where to start.
      </>
    ),
  },
  {
    term: "In the exam's own format",
    body: (
      <>
        Single best answers and full extended-matching sets, across the clinical
        and the non-clinical syllabus, and mock papers timed and weighted as the
        RCOG sets them.
      </>
    ),
  },
  {
    term: "Ask Pinard",
    body: (
      <>
        An AI assistant that answers revision questions from the same library
        and names its source, or tells you plainly when the sources do not
        cover what you asked.
      </>
    ),
  },
];

export default function AboutPage() {
  return (
    <>
      <TraceHeader
        title="How Pinard works"
        lede="MRCOG revision written from the guidance the paper is set on, and aimed at the topics where you are losing marks."
      />

      <p className="reading max-w-[38rem] text-ink/85">
        A pinard is the horn a midwife listens with. Pinard listens to your
        answers, finds where you are weakest, and points your revision there
        first.
      </p>

      <dl className="mt-10 divide-y divide-line border-y border-line">
        {POINTS.map((p) => (
          <div key={p.term} className="py-6">
            <dt className="font-display text-[21px] font-semibold leading-snug text-ink-strong">
              {p.term}
            </dt>
            <dd className="mt-2 font-ui text-[17px] leading-relaxed text-ink/80">{p.body}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-8 max-w-[38rem] font-ui text-[15px] leading-relaxed text-ink/70">
        Pinard is a revision aid. It is not a source of clinical advice, and no
        revision tool can promise you will pass. What it can do is make sure
        your practice is current and aimed where it will move your result.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ButtonLink href="/sign-up">{SIGN_UP_LABEL}</ButtonLink>
        <ButtonLink href="/pricing" variant="secondary">
          See pricing
        </ButtonLink>
        <ButtonLink href="/faq" variant="quiet">
          Read the FAQ
        </ButtonLink>
      </div>
    </>
  );
}
