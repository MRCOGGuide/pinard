import { Trace } from "@/components/Trace";
import { PricingTable } from "@/components/PricingTable";
import { ButtonLink, Card, CardTitle, Chip, Eyebrow } from "@/components/ui";
import { CountUp, Reveal } from "@/components/Reveal";
import type { TierPricing } from "@/lib/billing";

/**
 * What a visitor sees before signing in.
 *
 * Previously this was the app's own "Today" screen — an internal name,
 * one paragraph and three buttons — while everything persuasive sat on
 * /about with nothing linking to it. A question bank is bought on the
 * quality of its explanations, and there is no way to describe that in
 * prose, so the page shows one: a real approved question, its real
 * explanation, and the guideline it cites.
 *
 * Deliberately not: a gradient hero, a stock clinician holding a
 * tablet, or anything that moves except the trace.
 */

/** A specimen from the live bank, shown exactly as a candidate sees it. */
const SPECIMEN = {
  stem: `A 33-year-old woman, gravida 2 para 1, is in the second stage of labour at 39 weeks of gestation. She has a BMI of 35, is 158 cm tall, and her baby is estimated to weigh 4.2 kg on a recent growth scan. Fetal position is confirmed as occipito-posterior by intrapartum ultrasound, and the presenting part is at station 0. The registrar is considering proceeding with an assisted vaginal birth.

Which single factor in this clinical scenario is most strongly associated with an increased likelihood of failed assisted vaginal birth?`,
  options: [
    { key: "A", text: "Maternal BMI greater than 30" },
    { key: "B", text: "Occipito-posterior position" },
    { key: "C", text: "Maternal height below 160 cm" },
    { key: "D", text: "Estimated fetal weight greater than 4 kg" },
    { key: "E", text: "Station 0 at the midpelvis" },
  ],
  correct: "E",
  explanation:
    "All five features listed are recognised indicators of higher failure rates for assisted vaginal birth, and all five are present in this woman. However, station 0 (midpelvic station) carries the highest independent weighting: at station 0 the biparietal diameter lies above the level of the ischial spines, and failure rates are specifically noted to be highest at midpelvic stations — particularly when station is 0 or rotation is required. Any attempt at delivery in this scenario should be conducted as a trial in an operating theatre with immediate recourse to caesarean birth.",
  source: "Assisted Vaginal Birth — RCOG GTG No. 26, 2020",
};

const STEPS = [
  {
    n: "01",
    title: "Sit a diagnostic",
    body: "A short screening across every topic in the syllabus. It ends with an honest map of where you stand — every section drawn against the 70% pass line.",
  },
  {
    n: "02",
    title: "Get a plan built round your date",
    body: "Your weakest topics are front-loaded, secured ones return on a spaced schedule, and the final fortnight turns into mixed mock papers. It rebuilds itself as your performance moves.",
  },
  {
    n: "03",
    title: "Revise in the gaps you have",
    body: "A daily session sized for the time you actually get — twelve questions between cases, not an evening you will not spend. Sections below 70% get proportionally more of it.",
  },
  {
    n: "04",
    title: "Watch the trace cross the line",
    body: "Every topic tracks toward 70%. You always know which three are holding you back and how much ground is left.",
  },
];

export function Landing({ prices }: { prices?: TierPricing[] }) {
  return (
    <div className="-my-8 sm:-my-10">
      {/* Hero */}
      <section className="py-14 sm:py-20">
        <Eyebrow>MRCOG Part 1 · Part 2 · Part 3</Eyebrow>
        <h1 className="mt-3 font-display text-[2.1rem] font-semibold leading-[1.12] tracking-tight text-theatre sm:text-[2.7rem]">
          Revision that knows the guidance
          <br className="hidden sm:block" /> better than the textbook does.
        </h1>
        <Trace className="mt-4 h-5 w-52" />
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-graphite/80">
          Exam-style questions written only from current RCOG, NICE and
          specialist society guidance — every answer traced back to the
          paragraph it came from, and a plan built around your exam date.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ButtonLink href="/sign-up">Create an account</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary">
            See pricing
          </ButtonLink>
          <span className="font-mono text-xs text-graphite/50">
            7-day full refund, no questions asked
          </span>
        </div>
      </section>

      {/* Proof — the library, stated as fact. The two countable figures
          count, because a number that arrives is read; a number that is
          simply printed is skimmed. */}
      <section className="bleed border-y border-hairline bg-porcelain">
        <div className="mx-auto grid w-full max-w-question grid-cols-2 gap-x-6 gap-y-5 px-4 py-8 sm:grid-cols-4">
          <Reveal delay={0}>
            <p className="font-mono text-xl text-theatre">
              <CountUp to={952} />
            </p>
            <p className="mt-1 text-xs leading-snug text-graphite/60">
              curated source documents
            </p>
          </Reveal>
          <Reveal delay={80}>
            <p className="font-mono text-xl text-theatre">
              <CountUp to={16491} />
            </p>
            <p className="mt-1 text-xs leading-snug text-graphite/60">
              indexed passages
            </p>
          </Reveal>
          <Reveal delay={160}>
            <p className="font-mono text-xl text-theatre">Monthly</p>
            <p className="mt-1 text-xs leading-snug text-graphite/60">
              refreshed against new guidance
            </p>
          </Reveal>
          <Reveal delay={240}>
            <p className="font-mono text-xl text-theatre">Every answer</p>
            <p className="mt-1 text-xs leading-snug text-graphite/60">
              cited to its source
            </p>
          </Reveal>
        </div>
      </section>

      {/* The specimen — the actual product, not a description of it */}
      <Reveal as="section" className="py-14">
        <Eyebrow>A real question from the bank</Eyebrow>
        <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
          Judge it the way you would judge a textbook
        </h2>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-graphite/70">
          Not a sample written for a landing page. This is an approved question,
          its explanation, and the guideline it cites — exactly as a subscriber
          sees them.
        </p>

        <Card className="mt-6" pad="lg">
          <div className="flex flex-wrap items-center gap-2">
            <Chip>SBA</Chip>
            <Chip tone="neutral">Labour and Birth</Chip>
          </div>
          <p className="mt-4 whitespace-pre-line font-display text-[17px] leading-relaxed text-graphite">
            {SPECIMEN.stem}
          </p>
          <ul className="mt-5 space-y-2">
            {SPECIMEN.options.map((o) => {
              const correct = o.key === SPECIMEN.correct;
              return (
                <li
                  key={o.key}
                  className={`flex gap-3 rounded-card border px-4 py-3 text-sm ${
                    correct
                      ? "border-greentop bg-sage"
                      : "border-hairline bg-white opacity-70"
                  }`}
                >
                  <span className="font-mono text-xs leading-5 text-graphite/60">
                    {o.key}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-graphite">{o.text}</span>
                    {correct && (
                      <span className="mt-1 block font-mono text-[11px] uppercase tracking-wide text-greentop">
                        Correct
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t border-hairline pt-4">
            <Eyebrow>Explanation</Eyebrow>
            <p className="mt-1.5 text-sm leading-relaxed text-graphite/85">
              {SPECIMEN.explanation}
            </p>
            <p className="mt-3 border-t border-hairline pt-3 text-xs text-graphite/60">
              <span className="font-medium text-graphite/85">Source</span> ·{" "}
              {SPECIMEN.source}
            </p>
          </div>
        </Card>
      </Reveal>

      {/* Ask Pinard — the refusal is the selling point */}
      <section className="bleed border-y border-hairline bg-porcelain">
        <div className="mx-auto w-full max-w-question px-4 py-14">
          <Eyebrow>Ask Pinard</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            It would rather say nothing than invent something
          </h2>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-graphite/70">
            Ask it anything and it answers from the source library, naming the
            guidance. Ask it something the sources do not cover and it tells you
            so, which is the part a general chatbot cannot promise.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-card bg-sage px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                You
              </p>
              <p className="mt-1 text-sm text-graphite">
                Success rate of VBAC?
              </p>
            </div>
            <div className="px-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                Pinard
              </p>
              <p className="mt-1 text-sm leading-relaxed text-graphite/85">
                Overall success rate for planned VBAC is 72–75%. With at least
                one previous vaginal birth it rises to 85–90% — previous vaginal
                delivery is the single best predictor. If all four adverse
                predictors are present, success falls to around 40%.
              </p>
              <p className="mt-2 text-[11px] text-graphite/55">
                <span className="font-medium text-graphite/70">
                  Birth after Previous Caesarean Birth
                </span>{" "}
                · RCOG GTG No. 45, 2015
              </p>
            </div>
            <div className="rounded-card bg-sage px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                You
              </p>
              <p className="mt-1 text-sm text-graphite">
                And what does it say about elective sterilisation at the same
                time?
              </p>
            </div>
            <div className="px-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-graphite/50">
                Pinard
              </p>
              <p className="mt-1 text-sm leading-relaxed text-graphite/85">
                This is not covered in the current source material.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <Reveal as="section" className="py-14">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
          Four steps, then the same thing every day
        </h2>
        <ol className="mt-6 space-y-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90} className="flex gap-4">
              <span className="mt-0.5 font-mono text-xs text-graphite/40">
                {s.n}
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-theatre">
                  {s.title}
                </h3>
                <p className="mt-1 max-w-[56ch] text-sm leading-relaxed text-graphite/75">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Reveal>

      {/* Why it is different */}
      <section className="bleed border-y border-hairline bg-porcelain">
        <div className="mx-auto w-full max-w-question px-4 py-14">
          <Eyebrow>Why not a textbook</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            A book begins to date the day it is printed
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Card pad="md">
              <CardTitle>Current, not remembered</CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                Green-top Guidelines, NICE and TOG are revised continually. The
                library is refreshed monthly, so you revise what the examiners
                are reading now rather than what was true three editions ago.
              </p>
            </Card>
            <Card pad="md">
              <CardTitle>Traceable, not asserted</CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                Every claim carries the passage it came from. An answer whose
                citation cannot be found in the source is discarded before you
                ever see it — the check runs on every question.
              </p>
            </Card>
            <Card pad="md">
              <CardTitle>Reviewed by people who passed it</CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                Nothing reaches you unapproved. Every question is read by a
                Member of the RCOG who has sat the MRCOG themselves.
              </p>
            </Card>
            <Card pad="md">
              <CardTitle>Aimed where you are weak</CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                Sections below 70% get weighted more heavily in every session,
                in proportion to how far below they sit. Secure topics come back
                just often enough to stay secure.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <Reveal as="section" className="py-14">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
          One subscription, the whole syllabus
        </h2>
        <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-graphite/70">
          Quarterly matches a typical 10–14 week revision cycle. Cancel whenever
          you like, and there is a 7-day full refund if it is not for you.
        </p>
        <div className="mt-6">
          <PricingTable prices={prices} />
        </div>
      </Reveal>

      {/* Close */}
      <section className="bleed border-t border-hairline bg-porcelain">
        <div className="mx-auto w-full max-w-question px-4 py-14 text-center">
          <h2 className="font-display text-2xl font-semibold text-theatre">
            Find out where you actually stand
          </h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-graphite/75">
            The diagnostic takes about twenty minutes and tells you which three
            topics are holding you back. Most people are surprised by at least
            one of them.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/sign-up">Create an account</ButtonLink>
            <ButtonLink href="/about" variant="secondary">
              How it works
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
