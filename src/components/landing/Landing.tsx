import { Logo } from "@/components/Logo";
import { Trace } from "@/components/Trace";
import { PricingTable } from "@/components/PricingTable";
import { ButtonLink, CardTitle, Chip, Eyebrow } from "@/components/ui";
import { CountUp, Reveal } from "@/components/Reveal";
import { Journey } from "./Journey";
import {
  FigureAimed,
  FigureCurrent,
  FigureReviewed,
  FigureTraceable,
} from "./Figures";
import type { TierPricing } from "@/lib/billing";
import type { ExamAvailability } from "@/lib/examAvailability";
import type { Showcase, ShowcaseEmq, ShowcaseSba } from "@/lib/showcase";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";

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

/**
 * The pair shown when nothing has been featured in the Bank. Both are
 * real approved questions; the owner replaces them from Admin → Bank
 * without a deploy, and these stand in so the page is never left
 * without an example.
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
  source: "Diabetes in pregnancy — NICE NG3, 2020",
};

const EMQ_FALLBACK: ShowcaseEmq = {
  leadIn:
    "Each of the following clinical scenarios relates to the surgical and oncological management of cervical cancer. For each patient, select the SINGLE most appropriate management step from the list above.",
  options: [
    { key: "A", text: "Carboplatin chemotherapy" },
    { key: "B", text: "Para-aortic lymph node dissection" },
    { key: "C", text: "Cisplatin 40 mg/m² weekly" },
    { key: "D", text: "Open radical hysterectomy" },
    { key: "E", text: "Vaginal vault brachytherapy boost alone" },
    { key: "F", text: "Adjuvant pelvic radiotherapy alone" },
    { key: "G", text: "Neoadjuvant chemotherapy followed by radical hysterectomy" },
    { key: "H", text: "MRI pelvis" },
    { key: "I", text: "Adjuvant concurrent chemoradiotherapy" },
    { key: "J", text: "Observation" },
    { key: "K", text: "Definitive platinum-based chemoradiotherapy and brachytherapy" },
    { key: "L", text: "Laparoscopic radical hysterectomy" },
    { key: "M", text: "Radical trachelectomy" },
    { key: "N", text: "Pelvic exenteration" },
  ],
  optionCount: 14,
  stem: "A 44-year-old woman is diagnosed with FIGO 2018 stage IB3 squamous cell carcinoma of the cervix. MDT discussion concludes that the tumour size and stage make it highly likely she will require postoperative chemoradiotherapy if radical surgery is undertaken. She is fit for either surgical or non-surgical treatment. The team wish to follow Grade A BGCS guidance on avoiding combined modality morbidity. What is the single most appropriate primary treatment?",
  correct: "K",
  explanation:
    "For stage IB3 cervical cancer, treatment should avoid combining radical surgery with postoperative external beam radiotherapy, which raises morbidity without improving survival. Where postoperative chemoradiotherapy is anticipated, definitive platinum-based chemoradiotherapy and brachytherapy is preferred as primary treatment. This carries a Grade A recommendation.",
  source: "BGCS Cervical Cancer Guidelines, 2021",
};

/**
 * What makes the mock a mock, rather than a longer practice session.
 *
 * The weighting is the one most candidates do not know and the one
 * most likely to change how they revise: getting three quarters of the
 * SBAs and half the EMQs is not 62%, it is 60%, and the EMQs are where
 * the paper is won.
 */
const MOCK_FACTS = [
  {
    title: "Marked the way it is weighted",
    body: "SBAs carry 40% of the mark and EMQs 60%, exactly as in the real paper. Counting them equally would tell you that you had passed when the paper says otherwise.",
  },
  {
    title: "Timed the way it is timed",
    body: "Seventy minutes for the SBAs, a hundred and ten for the EMQs — the RCOG's own allowance. The paper tells you when you reach it, and lets you carry on if you would rather.",
  },
  {
    title: "Flag it and come back",
    body: "Move between the SBAs and the EMQs whenever you like, flag anything to return to, and hand in when you are ready. Run out of time and it is submitted as it stands.",
  },
  {
    title: "Pass or fail, then every answer",
    body: "A verdict, the split between the two formats, and then all one hundred questions with the answer, the reasoning and the guideline it came from.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Diagnostic",
    body: "A short screening across every topic in the syllabus. It ends with an honest map of where you stand — every section drawn against the 70% pass line.",
  },
  {
    n: "02",
    title: "Personalised plan",
    body: "Your weakest topics are front-loaded, secured ones return on a spaced schedule, and the final fortnight turns into mixed mock papers. It rebuilds itself as your performance moves.",
  },
  {
    n: "03",
    title: "Focus on the gaps",
    body: "A daily session sized for the time you actually get — twelve questions between cases, not an evening you will not spend. Sections below 70% get proportionally more of it.",
  },
  {
    n: "04",
    title: "Watch progress",
    body: "Every topic tracks toward 70%. You always know which three are holding you back and how much ground is left.",
  },
];

export function Landing({
  prices,
  availability,
  showcase,
}: {
  prices?: TierPricing[];
  availability?: ExamAvailability;
  showcase?: Showcase;
}) {
  // Whatever the owner has featured in the Bank, else the pair written
  // here — the page must never be left without an example.
  const sba = showcase?.sba ?? SBA_FALLBACK;
  const emq = showcase?.emq ?? EMQ_FALLBACK;

  const live = (["part1", "part2", "part3"] as ExamPart[]).filter(
    (p) => availability?.[p]
  );
  const liveParts = live.length
    ? `MRCOG ${live.map((p) => EXAM_LABELS[p]).join(" · ")}`
    : "MRCOG revision";

  return (
    <div className="relative -my-8 sm:-my-10">
      {/* The road, in the gutter beside the page. Decorative: it is
          hidden below large screens, where there is no spare margin. */}
      <Journey />

      {/* Hero */}
      <section data-journey="hero" className="py-14 sm:py-20">
        {/* Only the parts actually open to candidates. Advertising three
            when one is live is a promise the product cannot keep, and it
            reads as marketing rather than fact. */}
        <Eyebrow>{liveParts}</Eyebrow>
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
        </div>
        <p className="mt-3 font-mono text-xs text-graphite/50">
          7-day full refund, no questions asked
        </p>
      </section>

      {/* Proof — the library, stated as fact. The two countable figures
          count, because a number that arrives is read; a number that is
          simply printed is skimmed. */}
      <section className="bleed border-y border-hairline bg-porcelain">
        <div className="mx-auto grid w-full max-w-question grid-cols-2 gap-x-6 gap-y-5 px-4 py-8 sm:grid-cols-4">
          {[
            { figure: <CountUp to={952} />, label: "curated source documents" },
            { figure: <CountUp to={16491} />, label: "indexed passages" },
            { figure: "Monthly", label: "refreshed against new guidance" },
            { figure: "Every answer", label: "cited to its source" },
          ].map((f, i) => (
            <Reveal key={f.label} delay={i * 80} className="grow">
              <p className="grow-figure font-mono text-xl text-theatre">
                {f.figure}
              </p>
              <p className="grow-label mt-1 text-xs leading-snug text-graphite/60">
                {f.label}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Two specimens side by side, at the difficulty the exam is
          written to. A visitor can judge the writing without an account,
          which is the whole job of this section. */}
      <Reveal as="section" className="py-14" anchor="questions">
        <Eyebrow>Real questions from the bank</Eyebrow>
        <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
          Judge the writing before you pay for it
        </h2>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-graphite/70">
          Written in the style and register of the real paper — single best
          answers and true extended-matching sets, at the difficulty the exam
          actually asks. Both of these are approved questions a subscriber
          meets today, not samples written for a landing page.
        </p>

        {/* Equal heights, so the EMQ is cut only where it genuinely runs
            past the SBA beside it rather than at an arbitrary line. */}
        <div className="mt-6 grid items-stretch gap-3 sm:grid-cols-2">
          {/* SBA — shown whole; it sets the height. */}
          <div className="lift flex h-full flex-col rounded-card border border-hairline bg-white p-4 shadow-card">
            <Chip tone="good" className="self-start">
              SBA
            </Chip>
            <p className="mt-3 text-[13px] leading-relaxed text-graphite">
              {sba.stem}
            </p>
            <ul className="mt-3 space-y-1.5">
              {sba.options.map((o) => {
                const correct = o.key === sba.correct;
                return (
                  <li
                    key={o.key}
                    className={`flex gap-2 rounded-card border px-2.5 py-1.5 text-[12px] ${
                      correct
                        ? "border-greentop bg-sage"
                        : "border-hairline bg-white text-graphite/70"
                    }`}
                  >
                    <span className="font-mono text-[11px] leading-5 text-graphite/55">
                      {o.key}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{o.text}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 border-t border-hairline pt-2.5">
              <p className="font-mono text-[10px] uppercase tracking-wide text-greentop">
                Explanation
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-graphite/80">
                {sba.explanation}
              </p>
            </div>
            <p className="mt-auto pt-2 text-[11px] text-graphite/55">
              {sba.source}
            </p>
          </div>

          {/* EMQ — the whole set inside a card the height of the SBA
              beside it. Nothing is cut: a fourteen-option list is what
              makes an EMQ an EMQ, so a visitor reads all of it, the
              answer and the explanation. The region scrolls only if a
              longer set is featured than the SBA can make room for. */}
          <div className="lift flex h-full flex-col rounded-card border border-hairline bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip tone="good">EMQ</Chip>
              <Chip>{emq.optionCount} shared options</Chip>
            </div>
            <div className="relative mt-3 min-h-0 flex-1">
              <div className="emq-scroll h-full overflow-y-auto pr-1">
                <p className="text-[12px] italic leading-relaxed text-graphite/70">
                  {emq.leadIn}
                </p>
                <ul className="mt-2.5 space-y-1 rounded-card border border-hairline bg-sage/50 p-2.5">
                  {emq.options.map((o) => {
                    const correct = o.key === emq.correct;
                    return (
                      <li
                        key={o.key}
                        className={`flex gap-2 rounded px-1 py-0.5 text-[12px] ${
                          correct ? "bg-greentop/15" : ""
                        }`}
                      >
                        <span
                          className={`font-mono text-[11px] ${
                            correct
                              ? "font-medium text-greentop"
                              : "text-graphite/55"
                          }`}
                        >
                          {o.key}
                        </span>
                        <span
                          className={`leading-snug ${
                            correct
                              ? "font-medium text-theatre"
                              : "text-graphite/80"
                          }`}
                        >
                          {o.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-greentop">
                  Scenario 1
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-graphite">
                  {emq.stem}
                </p>
                <div className="mt-3 border-t border-hairline pt-2.5">
                  <p className="font-mono text-[10px] uppercase tracking-wide text-greentop">
                    Answer {emq.correct} · Explanation
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-graphite/80">
                    {emq.explanation}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-2 pt-2 text-[11px] text-graphite/55">{emq.source}</p>
          </div>
        </div>
      </Reveal>

      {/* Ask Pinard — the refusal is the selling point */}
      <section
        data-journey="ask"
        className="bleed border-y border-hairline bg-porcelain"
      >
        <div className="mx-auto w-full max-w-question px-4 py-14">
          <div className="flex items-start gap-4">
            {/* The mark sits beside its own feature and answers to the
                pointer — the arcs quicken, as though it has heard you. */}
            <span className="logo-listen hidden shrink-0 sm:block">
              <Logo variant="mark" className="h-14 w-auto" />
            </span>
            <div>
              <Eyebrow>Ask Pinard</Eyebrow>
              <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
                A source-grounded AI that will not invent an answer
              </h2>
            </div>
          </div>
          <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-graphite/70">
            Ask it anything and it answers from the source library, naming the
            guidance it came from. Ask it something the sources do not cover and
            it says so — the one promise a general chatbot cannot make.
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
          </div>
        </div>
      </section>

      {/* How it works */}
      <Reveal as="section" className="py-14" anchor="steps">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
          Four steps, then the same thing every day
        </h2>
        {/* Cards rather than a list: four steps read as four things you
            will do, and each one answers to the pointer. */}
        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 90}>
              <div className="lift h-full rounded-card border border-hairline bg-white p-5 shadow-card">
                <span className="font-mono text-xs text-heartbeat">{s.n}</span>
                <h3 className="mt-2 font-display text-base font-semibold text-theatre">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-graphite/75">
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Reveal>

      {/* The mock paper — the one thing here that is not revision */}
      <section
        data-journey="mock"
        className="bleed border-y border-hairline bg-porcelain"
      >
        <div className="mx-auto w-full max-w-question px-4 py-14">
          <Eyebrow>Mock exam</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            Sit the paper before you sit the paper
          </h2>
          <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-graphite/75">
            Fifty SBAs and fifty EMQs, three hours on the clock, nothing marked
            until you hand it in. Everything the rest of Pinard does to help you
            — telling you straight away, explaining as you go — is switched off,
            because that is not what an exam does.
          </p>

          {/* The real chrome, not a drawing of it: the clock, the counter
              and the two halves of the paper as a candidate sees them. */}
          <Reveal className="mt-6">
            <div className="rounded-card border border-hairline bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-graphite/60">
                  38 / 100 answered
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums text-theatre">
                  1:47:05
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="flex overflow-hidden rounded-card border border-hairline text-xs">
                  <span className="bg-theatre px-2.5 py-1 text-porcelain">
                    SBAs · 50
                  </span>
                  <span className="border-l border-hairline px-2.5 py-1 text-graphite/70">
                    EMQs · 50
                  </span>
                </span>
                <span className="rounded-card border border-amber/60 px-2.5 py-1 font-mono text-xs text-amber">
                  Flagged · 4
                </span>
              </div>
            </div>
          </Reveal>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {MOCK_FACTS.map((f, i) => (
              <Reveal key={f.title} delay={i * 90}>
                <div className="lift h-full rounded-card border border-hairline bg-white p-5 shadow-card">
                  <h3 className="font-display text-base font-semibold text-theatre">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-graphite/75">
                    {f.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Why it is different */}
      <section
        data-journey="current"
        className="bleed border-y border-hairline bg-porcelain"
      >
        <div className="mx-auto w-full max-w-question px-4 py-14">
          <Eyebrow>Why not a textbook</Eyebrow>
          <h2 className="mt-2 font-display text-2xl font-semibold text-theatre">
            A book begins to date the day it is printed
          </h2>
          {/* Each card carries a drawn figure that demonstrates its claim
              when you point at it — the edition being replaced, the claim
              tied to its passage, the approval, the topic climbing to 70. */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "Current, not remembered",
                figure: <FigureCurrent />,
                body: "Green-top Guidelines, NICE and TOG are revised continually. The library is refreshed monthly, so you revise what the examiners are reading now rather than what was true three editions ago.",
              },
              {
                title: "Traceable, not asserted",
                figure: <FigureTraceable />,
                body: "Every claim carries the passage it came from. An answer whose citation cannot be found in the source is discarded before you ever see it — the check runs on every question.",
              },
              {
                title: "Reviewed by people who passed it",
                figure: <FigureReviewed />,
                body: "Nothing reaches you unapproved. Every question is read by a Member of the RCOG who has sat the MRCOG themselves.",
              },
              {
                title: "Aimed where you are weak",
                figure: <FigureAimed />,
                body: "Sections below 70% get weighted more heavily in every session, in proportion to how far below they sit. Secure topics come back just often enough to stay secure.",
              },
            ].map((card, i) => (
              <Reveal key={card.title} delay={i * 90}>
                <div className="lift h-full rounded-card border border-hairline bg-white p-5 shadow-card">
                  <div className="mb-3">{card.figure}</div>
                  <CardTitle>{card.title}</CardTitle>
                  <p className="mt-2 text-sm leading-relaxed text-graphite/75">
                    {card.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <Reveal as="section" className="py-14" anchor="pricing">
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
      <section
        data-journey="start"
        className="bleed border-t border-hairline bg-porcelain"
      >
        <div className="mx-auto w-full max-w-question px-4 py-14 text-center">
          <h2 className="font-display text-2xl font-semibold text-theatre">
            Find out where you actually stand
          </h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-graphite/75">
            The diagnostic takes about twenty minutes and tells you which three
            topics are holding you back. Most people are surprised by at least
            one of them.
          </p>
          {/* The end of the road. */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
