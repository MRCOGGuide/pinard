import { PlansBlock } from "@/components/PlansBlock";
import { ButtonLink } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import type { LibrarySize } from "@/lib/library";
import type { Testimonial } from "@/lib/offer";
import type { PlansProps } from "@/lib/plansProps";
import type { ExamAvailability } from "@/lib/examAvailability";
import type { Showcase, ShowcaseSba } from "@/lib/showcase";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { SIGN_UP_LABEL } from "@/lib/launch";
import { Specimen } from "./Specimen";
import { AskPinardFeature, HowItWorks } from "./HowItWorks";
import { LiveTrace } from "./LiveTrace";
import { ScrollFade } from "@/components/scroll";

/**
 * What a visitor sees before signing in.
 *
 * Rebuilt in the editorial direction (docs/design/DIRECTION.md). The
 * page used to be assembled from template blocks: a stat strip, two
 * 2×2 grids of identical cards with drawn illustrations, a decorative
 * rail down the margin and nine sections fading in on scroll, eleven
 * phone screens long. A question bank is bought on the quality of its
 * questions, so the opening screen now holds one you can answer, and
 * the rest is said in four steps, each with a picture of it happening.
 *
 * At the owner's request every section fades in as it is reached and
 * out as it is left, and every picture replays each time (./scroll).
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
  sections: 35,
};

/** The wide frame the landing page is set in, wider than the app's
 *  reading column, with the same gutters at every width. */
const FRAME = "mx-auto w-full max-w-[1120px] px-4 sm:px-8";

export function Landing({
  plans,
  availability,
  showcase,
  library = LAST_COUNTED,
  testimonials,
}: {
  /** This visitor's own prices, decided on the server (lib/plansProps). */
  plans?: PlansProps | null;
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
    <div data-wide="" className="-my-8 sm:-my-10">
      {/* Opening: what it is, and one real question to answer. */}
      <ScrollFade className="bleed">
        <div className={`${FRAME} grid items-start gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:gap-16 lg:py-20`}>
          <div className="lg:pt-6">
            <h1 className="max-w-[16ch] font-serif text-[36px] font-semibold leading-[1.08] tracking-[-0.015em] text-ink-strong [font-variation-settings:'opsz'_72] sm:text-[46px]">
              Revise your {paper} from the latest guidance
            </h1>
            <LiveTrace className="mt-5 h-5 w-48" />
            <p className="mt-5 max-w-[34rem] font-ui text-[18px] leading-relaxed text-ink/80">
              SBA and EMQ sets written from current RCOG Green-top Guidelines,
              NICE guidance and high-impact review articles. Every explanation
              names the source it came from,
              and your personalised plan is built from your exam date.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/sample" className="h-12 px-6 text-[16px]">
                Try the questions
              </ButtonLink>
              <ButtonLink href="/sign-up" variant="secondary" className="h-12 px-6 text-[16px]">
                {SIGN_UP_LABEL}
              </ButtonLink>
            </div>
            <p className="mt-4 font-ui text-[14px] text-ink/65">
              Full refund within 14 days. Cancel whenever you like.
            </p>
          </div>

          <Specimen sba={sba} more="Try more without an account" />
        </div>
      </ScrollFade>

      {/* The library, stated as one sentence of fact rather than a strip
          of big numbers. The two counts still arrive, read live. */}
      <ScrollFade className="bleed border-y border-line">
        <div className={`${FRAME} py-8`}>
          <p className="max-w-[52rem] font-serif text-[21px] leading-snug text-ink sm:text-[24px]">
            <span className="font-semibold tabular-nums text-ink-strong">
              <CountUp to={floorRound(library.questions)} />+
            </span>{" "}
            questions written from{" "}
            <span className="font-semibold tabular-nums text-ink-strong">
              <CountUp to={floorRound(library.documents)} />+
            </span>{" "}
            pieces of current guidance, each approved by a Member of the RCOG
            before you see it, and refreshed every quarter as the guidance
            changes.
          </p>
        </div>
      </ScrollFade>

      {/* What it does: the four steps a candidate goes through, each
          beside a picture of it happening (HowItWorks). */}
      <section className="bleed">
        <ScrollFade as="div" className={`${FRAME} pt-14 sm:pt-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            What Pinard does
          </h2>
          <p className="mt-3 max-w-[40rem] font-ui text-[18px] leading-relaxed text-ink/80">
            Pinard finds where you are weak, builds your plan around those
            topics, and uses AI to tell you where to start. Your revision goes
            where your marks are.
          </p>
        </ScrollFade>
        <div className={`${FRAME} pb-6 pt-6 sm:pb-10`}>
          <HowItWorks sections={library.sections} />
        </div>
      </section>

      {/* Ask Pinard: not a step, something to use at any point. */}
      <section className="bleed border-t border-line bg-surface">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <AskPinardFeature />
        </div>
      </section>

      {/* Words written by somebody other than us, if there are any. No
          placeholder: an invented testimonial is a lie about a person. */}
      {testimonials && testimonials.length > 0 && (
        <ScrollFade className="bleed border-t border-line">
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
                  <p className="mt-3 font-ui text-[14px] text-ink/65">
                    <span className="font-semibold text-ink/80">{t.name}</span>
                    {t.detail ? `, ${t.detail}` : ""}
                    {t.score ? `. Scored Pinard ${t.score} out of 10.` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </ScrollFade>
      )}

      {/* Pricing */}
      <ScrollFade className="bleed border-t border-line" id="pricing">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            Every plan, the whole Part 2 syllabus
          </h2>
          <p className="mt-3 max-w-[40rem] font-ui text-[17px] leading-relaxed text-ink/75">
            Three months fits a typical ten to fourteen week revision run. Plans
            renew until you cancel, which you can do whenever you like, with a
            full refund within 14 days if it is not for you.
          </p>
          <div className="mt-8">
            <PlansBlock plans={plans} />
          </div>
        </div>
      </ScrollFade>

      {/* Close */}
      <ScrollFade className="bleed border-t border-line bg-surface">
        <div className={`${FRAME} py-14 sm:py-20`}>
          <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
            Find out where you stand
          </h2>
          <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/75">
            The free diagnostic is fifteen questions spread across
            Pinard&rsquo;s {library.sections} revision sections, and takes about
            a quarter of an hour.
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
      </ScrollFade>
    </div>
  );
}

/**
 * A count rounded down to a figure that stays true while the bank grows:
 * hundreds from a thousand (2,014 reads 2,000+, 2,101 reads 2,100+),
 * fifties below it (951 reads 950+).
 */
function floorRound(n: number): number {
  const step = n >= 1000 ? 100 : 50;
  return Math.floor(n / step) * step;
}
