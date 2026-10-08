import { Trace } from "@/components/Trace";
import { PricingTable } from "@/components/PricingTable";
import { ButtonLink } from "@/components/ui";
import { CountUp } from "@/components/Reveal";
import type { LibrarySize } from "@/lib/library";
import type { PricingSettings, Testimonial } from "@/lib/offer";
import type { TierPricing } from "@/lib/billing";
import type { ExamAvailability } from "@/lib/examAvailability";
import type { Showcase, ShowcaseSba } from "@/lib/showcase";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { AnswerDisclaimer } from "@/components/AnswerDisclaimer";
import { SIGN_UP_LABEL } from "@/lib/launch";
import { Specimen } from "./Specimen";

/**
 * What a visitor sees before signing in.
 *
 * Rebuilt in the editorial direction (docs/design/DIRECTION.md). The
 * page used to be assembled from template blocks: a stat strip, two
 * 2×2 grids of identical cards with drawn illustrations, a decorative
 * rail down the margin and nine sections fading in on scroll, eleven
 * phone screens long. A question bank is bought on the quality of its
 * questions, so the opening screen now holds one you can answer, and
 * the rest is said in a few plain rows.
 */

/**
 * Shown when nothing has been featured in the Bank. A real approved
 * question; the owner replaces it from Admin → Bank without a deploy.
 */
const SBA_FALLBACK: ShowcaseSba = {
  stem: "A 34-year-old woman with type 1 diabetes mellitus attends her 36-week antenatal appointment. Her pregnancy has been otherwise uncomplicated. She asks about the timing and mode of birth. According to NICE guidance, what is the most appropriate management regarding the timing of birth for this woman?",
  options: [
    { key: "A", text: "Induction or caesarean between 37+0 and 38+6 weeks" },
    { key: "B", text: "Await spontaneous labour, birth by 40+6 weeks" },
    { key: "C", text: "Induction or caesarean at 39+0 to 39+6 weeks" },
    { key: "D", text: "Induction or caesarean at 40+0 weeks" },
    { key: "E", text: "Induction or caesarean between 36+0 and 36+6 weeks" },
  ],
  correct: "A",
  explanation:
    "Women with type 1 or type 2 diabetes should be offered induction of labour, or caesarean section if indicated, between 37+0 and 38+6 weeks of gestation. This woman has type 1 diabetes and falls into that category.",
  source: "Diabetes in pregnancy: NICE NG3, 2020",
};

/* Only for a caller that renders this without counting. */
const LAST_COUNTED: LibrarySize = {
  documents: 952,
  passages: 16491,
  questions: 1958,
};

/** The wide frame the landing page is set in, wider than the app's
 *  reading column, with the same gutters at every width. */
const FRAME = "mx-auto w-full max-w-[1120px] px-4 sm:px-8";

export function Landing({
  prices,
  availability,
  showcase,
  library = LAST_COUNTED,
  pricing,
  country,
  testimonials,
}: {
  prices?: TierPricing[];
  /** The founding offer and the resit comparison, both owner-set. */
  pricing?: PricingSettings;
  /** Where the request came from, for the figure in their own money. */
  country?: string | null;
  /** Real ones or none; there is no placeholder. */
  testimonials?: Testimonial[];
  availability?: ExamAvailability;
  showcase?: Showcase;
  /** Counted at request time, so the claim stays true as it is fed. */
  library?: LibrarySize;
}) {
  const sba = showcase?.sba ?? SBA_FALLBACK;

  // Only the parts actually open to candidates are named: advertising
  // three when one is live is a promise the product cannot keep.
  const live = (["part1", "part2", "part3"] as ExamPart[]).filter((p) => availability?.[p]);
  const paper = live.length === 1 ? `MRCOG ${EXAM_LABELS[live[0]]}` : "MRCOG";

  return (
    <div data-design="editorial" data-wide="" className="-my-8 sm:-my-10">
      {/* Opening: what it is, and one real question to answer. */}
      <section className="bleed">
        <div className={`${FRAME} grid items-start gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:py-20`}>
          <div className="lg:pt-6">
            <h1 className="max-w-[16ch] font-serif text-[36px] font-semibold leading-[1.08] tracking-[-0.015em] text-ink-strong [font-variation-settings:'opsz'_72] sm:text-[46px]">
              {paper} questions written from the guidance the examiners read
            </h1>
            <Trace className="mt-5 h-5 w-48" />
            <p className="mt-5 max-w-[34rem] font-ui text-[18px] leading-relaxed text-ink/80">
              Single best answers and full EMQ sets written from current RCOG
              Green-top Guidelines, NICE and TOG. Every explanation names the
              guideline it came from, and your plan is built back from your exam
              date.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/sample" className="h-12 px-6 text-[16px]">
                Try the questions
              </ButtonLink>
              <ButtonLink href="/sign-up" variant="secondary" className="h-12 px-6 text-[16px]">
                {SIGN_UP_LABEL}
              </ButtonLink>
            </div>
            <p className="mt-4 font-ui text-[14px] text-ink/60">
              Full refund within 7 days. Cancel whenever you like.
            </p>
          </div>

          <Specimen sba={sba} more="Try more without an account" />
        </div>
      </section>

      {/* The library, stated as one sentence of fact rather than a strip
          of big numbers. The two counts still arrive, read live. */}
      <section className="bleed border-y border-line">
        <div className={`${FRAME} py-8`}>
          <p className="max-w-[52rem] font-serif text-[21px] leading-snug text-ink sm:text-[24px]">
            <CountUp to={library.questions} className="font-semibold tabular-nums text-ink-strong" />{" "}
            questions written from{" "}
            <CountUp to={library.documents} className="font-semibold tabular-nums text-ink-strong" />{" "}
            pieces of current guidance, each approved by a Member of the RCOG
            before you see it, and refreshed every quarter as the guidance
            changes.
          </p>
        </div>
      </section>

      {/* What it does: four plain rows, the term on the left. */}
      <section className="bleed">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            What Pinard does
          </h2>
          <dl className="mt-8 divide-y divide-line border-y border-line">
            <Row term="Questions from the guidance itself">
              Every SBA and EMQ is written from a named Green-top Guideline,
              NICE guideline or TOG review, at the standard of the Part 2 paper.
              The explanation cites the passage it relies on, and a question
              whose citation does not check out is discarded before anyone sees
              it.
            </Row>
            <Row term="A plan built back from your exam date">
              A free fifteen-question diagnostic places you against the 70% pass
              line. Each day&rsquo;s session then gives the topics below 70%
              more time in proportion to how far below they sit, brings secure
              topics back on a spaced schedule, and turns into mixed papers in
              the final fortnight.
            </Row>
            <Row term="Ask Pinard, which cites or declines">
              <span className="block">
                Ask a follow-up and it answers from the same guidance, naming
                its source, or tells you plainly that the sources do not cover
                it.
              </span>
              <span className="mt-4 block rounded-[10px] bg-sunk p-4">
                <span className="block text-[14px] text-ink/60">You asked</span>
                <span className="block font-medium text-ink">Success rate of VBAC?</span>
                <span className="mt-3 block text-[14px] text-ink/60">Pinard</span>
                <span className="reading block !text-[16px] text-ink/90">
                  Overall success for planned VBAC is 72 to 75%. With at least
                  one previous vaginal birth it rises to 85 to 90%, and a
                  previous vaginal birth, particularly a previous VBAC, is the
                  single best predictor.
                </span>
                <span className="mt-2 block text-[13px] text-ink/60">
                  Birth after Previous Caesarean Birth. RCOG Green-top Guideline
                  No. 45, 2015
                </span>
                <AnswerDisclaimer className="mt-2" />
              </span>
            </Row>
            <Row term="A mock under exam conditions">
              Fifty SBAs and fifty EMQs, timed at seventy and a hundred and ten
              minutes as the RCOG recommends, marked 40% and 60% as the paper
              is, with nothing revealed until you hand it in. Then every answer,
              with its reasoning and its guideline.
            </Row>
          </dl>
        </div>
      </section>

      {/* Words written by somebody other than us, if there are any. No
          placeholder: an invented testimonial is a lie about a person. */}
      {testimonials && testimonials.length > 0 && (
        <section className="bleed border-t border-line">
          <div className={`${FRAME} py-14`}>
            <h2 className="font-serif text-[28px] font-semibold text-ink-strong">
              What candidates said
            </h2>
            <ul className="mt-8 grid gap-10 sm:grid-cols-2">
              {testimonials.map((t, i) => (
                <li key={i}>
                  <blockquote className="font-serif text-[20px] leading-snug text-ink">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <p className="mt-3 font-ui text-[14px] text-ink/60">
                    <span className="font-semibold text-ink/80">{t.name}</span>
                    {t.detail ? `, ${t.detail}` : ""}
                    {t.score ? `. Scored Pinard ${t.score} out of 10.` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Pricing */}
      <section className="bleed border-t border-line" id="pricing">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            One subscription for the whole syllabus
          </h2>
          <p className="mt-3 max-w-[40rem] font-ui text-[17px] leading-relaxed text-ink/75">
            Quarterly fits a typical ten to fourteen week revision run. Cancel
            whenever you like, with a full refund within 7 days if it is not for
            you.
          </p>
          <div className="mt-8 max-w-[56rem]">
            <PricingTable prices={prices} settings={pricing} country={country} />
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="bleed border-t border-line bg-surface">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            Find out where you stand
          </h2>
          <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/75">
            The diagnostic is fifteen questions, one from each of fifteen parts
            of the syllabus, and takes about a quarter of an hour. It is free.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/sign-up" className="h-12 px-6 text-[16px]">
              {SIGN_UP_LABEL}
            </ButtonLink>
            <ButtonLink href="/sample" variant="secondary" className="h-12 px-6 text-[16px]">
              Try the questions first
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One thing Pinard does: the name of it, then what actually happens. */
function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-7 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-10">
      <dt className="font-serif text-[21px] font-semibold leading-snug text-ink-strong">
        {term}
      </dt>
      <dd className="max-w-[40rem] font-ui text-[17px] leading-relaxed text-ink/80">
        {children}
      </dd>
    </div>
  );
}
