import { PlansBlock } from "@/components/PlansBlock";
import { AnswerDisclaimer } from "@/components/AnswerDisclaimer";
import { ButtonLink } from "@/components/ui";
import { FREE_DIAGNOSTIC_MAX } from "@/lib/diagnostic";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { SIGN_UP_LABEL } from "@/lib/launch";
import type { LibrarySize } from "@/lib/library";
import type { Testimonial } from "@/lib/offer";
import type { PlansProps } from "@/lib/plansProps";
import type { ExamAvailability } from "@/lib/examAvailability";
import type { Showcase, ShowcaseSba } from "@/lib/showcase";
import { AskPicture } from "./AskPicture";
import { BookPanels } from "./BookPanels";
import { CtgLine } from "./CtgLine";
import { Question } from "./Question";
import { Statement } from "./Statement";
import { Steps } from "./Steps";
import { Stage } from "./Stage";
import "./landing.css";

/**
 * What a visitor sees before signing in.
 *
 * It opens on a stage: the words, and the Pinard horn itself, drawn
 * live and able to be turned (./Stage). A question bank is bought on
 * the quality of its questions, so the first thing under the stage is
 * one real question to answer, beside the sentence about the library
 * it came from: the claim and its proof, read together. Then the four
 * steps a candidate goes through, Ask Pinard, what sets Pinard apart,
 * the plans and the close.
 *
 * Nothing on the page runs on a timer. Each picture follows the scroll
 * or the hand, so it stops when the reader stops and runs backwards
 * when they scroll back (./motion). Approved by the owner from a local
 * preview, 11 November 2026 (docs/BUILD-PHASES.md).
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

const LAST_COUNTED: LibrarySize = { documents: 952, passages: 16491, questions: 1958, sections: 36 };

/**
 * A count rounded down to a figure that stays true while the bank grows:
 * hundreds from a thousand (2,014 reads 2,000+), fifties below it.
 */
function floorRound(n: number): number {
  const step = n >= 1000 ? 100 : 50;
  return Math.floor(n / step) * step;
}

export function Landing({
  plans,
  availability,
  showcase,
  library = LAST_COUNTED,
  testimonials,
}: {
  plans?: PlansProps | null;
  availability?: ExamAvailability;
  showcase?: Showcase;
  library?: LibrarySize;
  testimonials?: Testimonial[];
}) {
  const sba = showcase?.sba ?? SBA_FALLBACK;
  const live = (["part1", "part2", "part3"] as ExamPart[]).filter((p) => availability?.[p]);
  const paper = live.length === 1 ? `MRCOG ${EXAM_LABELS[live[0]]}` : "MRCOG";

  /* The owner's alternating bands (10 October 2026), counted as the
     page renders because testimonials are there only when there are
     some. The opening is its own dark stage and does not take a turn. */
  let band = 0;
  const tone = () => (band++ % 2 === 1 ? "pl-band-surface" : "pl-band-ground");

  return (
    <div className="pl-root pd-root -my-8 sm:-my-10">
      {/* The opening: the words, and the instrument. */}
      <Stage>
        <h1 className="pd-display">
          Revise your <span className="whitespace-nowrap">{paper}</span> from the latest guidance
        </h1>
        <CtgLine />
        <p className="pl-lede pd-stage-lede">
          SBA and EMQ sets written from current RCOG Green-top Guidelines, NICE guidance and
          high-impact review articles. Every explanation names the source it came from, and your
          personalised plan is built from your exam date.
        </p>
        <div className="pd-stage-cta flex flex-wrap items-center gap-3">
          <ButtonLink href="/sample" className="pl-button pd-pill">
            Try the questions
          </ButtonLink>
          <ButtonLink href="/sign-up" variant="secondary" className="pl-button pd-pill pd-ghost">
            {SIGN_UP_LABEL}
          </ButtonLink>
        </div>
        <p className="pl-small pd-stage-note">Full refund within 14 days. Cancel whenever you like.</p>
        {/* On a phone the horn stands here, between the buttons and the
            paragraph; on a wider screen it has the right of the stage
            and this takes no room. */}
        <div className="pd-stage-room" aria-hidden="true" />
      </Stage>

      {/* The claim, and beside it one of the questions it is about. */}
      <section className={`bleed ${tone()}`}>
        <div className="pl-frame pd-proof">
          <Statement
            parts={[
              { text: `${floorRound(library.questions).toLocaleString("en-GB")}+`, strong: true },
              { text: "questions written from" },
              { text: `${floorRound(library.documents).toLocaleString("en-GB")}+`, strong: true },
              { text: "pieces of current guidance, each approved by a Member of the RCOG before you see it." },
            ]}
          />
          <Question sba={sba} more="Try more without an account" />
        </div>
      </section>

      {/* The four steps, each held beside its picture while it plays. */}
      <section className={`bleed ${tone()}`}>
        <div className="pl-frame pl-section-top">
          <div className="pl-rise">
            <h2 className="pl-heading">What Pinard does</h2>
            <p className="pl-lede mt-5 max-w-[40rem]">
              Pinard finds where you are weak, builds your plan around those topics, and uses AI to
              tell you where to start. Your revision goes where your marks are.
            </p>
          </div>
        </div>
        <div className="pl-frame">
          <Steps sections={library.sections} />
        </div>
      </section>

      {/* Ask Pinard, on the page's second deep band. Not one of the
          alternating pair, so it does not take a turn in the count. */}
      <section className="bleed pl-deep">
        <div className="pl-frame pl-section pl-two-up">
          <div className="pl-rise max-w-[34rem]">
            <p className="pl-spark">
              <Spark /> AI assistant
            </p>
            <h2 className="pl-heading mt-3">Ask Pinard</h2>
            <p className="pl-lede mt-5">
              Ask about any topic or clinical scenario on the syllabus and get a short, sourced
              answer, whether or not you are practising questions at the time.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                "Answers only from trusted sources: the guidelines and review articles in Pinard's library",
                "Names the guideline behind every answer, so you can check it",
                "Tells you plainly when the sources do not cover your question, rather than guessing",
              ].map((t) => (
                <li key={t} className="pl-body flex gap-3">
                  <Tick />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <AnswerDisclaimer className="mt-7" />
          </div>
          <AskPicture />
        </div>
      </section>

      {/* What sets Pinard apart, in two pictures the reader can move. */}
      <section className={`bleed ${tone()}`}>
        <div className="pl-frame pl-section">
          <h2 className="pl-heading pl-rise">What a book can&rsquo;t do</h2>
          <BookPanels />
        </div>
      </section>

      {/* Real words from real people, or nothing. */}
      {testimonials && testimonials.length > 0 && (
        <section className={`bleed ${tone()}`}>
          <div className="pl-frame pl-section pl-rise">
            <h2 className="pl-heading">What candidates said</h2>
            <ul className="mt-10 grid gap-10 sm:grid-cols-2">
              {testimonials.map((t, i) => (
                <li key={i}>
                  <blockquote className="font-serif text-[1.375rem] leading-snug text-ink">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <p className="pl-small mt-3">
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

      {/* Pricing: the real block, this visitor's real prices. */}
      <section className={`bleed ${tone()}`} id="pricing">
        <div className="pl-frame pl-section">
          <div className="pl-rise">
            <h2 className="pl-heading">Every plan, the whole Part 2 syllabus</h2>
            <p className="pl-body mt-5 max-w-[40rem]">
              Three months fits a typical ten to fourteen week revision run. Plans renew until you
              cancel, which you can do whenever you like, with a full refund within 14 days if it
              is not for you.
            </p>
          </div>
          <div className="mt-10">
            <PlansBlock plans={plans} />
          </div>
        </div>
      </section>

      {/* Close: one message, so it may stand in the middle. */}
      <section className={`bleed ${tone()}`}>
        <div className="pl-frame pl-section pl-rise text-center">
          <h2 className="pl-heading mx-auto max-w-[18ch]">Find out where you stand</h2>
          <p className="pl-body mx-auto mt-5 max-w-[38rem]">
            The free sample diagnostic asks {FREE_DIAGNOSTIC_MAX} questions from across
            Pinard&rsquo;s {library.sections} revision sections, a single best answer or a pair of EMQ
            scenarios from each it covers, then previews the first fortnight of your plan.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/sign-up" className="pl-button pd-pill">
              {SIGN_UP_LABEL}
            </ButtonLink>
            <ButtonLink href="/sample" variant="secondary" className="pl-button pd-pill">
              Try the questions first
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="currentColor" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="mt-1 h-4 w-4 shrink-0 text-good" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
