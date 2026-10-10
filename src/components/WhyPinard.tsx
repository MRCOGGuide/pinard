import { FULL_PAPER, SECONDS_PER_EMQ, SECONDS_PER_SBA } from "@/lib/mock";
import { RETRY_INTERVALS_DAYS } from "@/lib/review";

/**
 * Why revise with Pinard: what it does that a candidate will not find
 * together anywhere else (owner's request, 10 October 2026, to make the
 * case against the other Part 2 resources).
 *
 * Every line is something the app does today and can be checked in the
 * code: the source rules (lib/generation), the quarterly retirement of
 * superseded guidance (Admin > Superseded), the plan (lib/studyPlan), the
 * retry schedule (lib/review), the mock's timing and marking (lib/mock)
 * and Ask Pinard's sources-only answers. No competitor is named and none
 * is described: the contrast is with recalled questions and printed
 * books, which is a statement about those formats, not about anyone.
 *
 * Shown on the landing page before the plans, and under the plans on
 * /pricing, where the decision is made.
 */
const SBA_MINUTES = Math.round((FULL_PAPER.sba * SECONDS_PER_SBA) / 60);
const EMQ_MINUTES = Math.round((FULL_PAPER.emq * SECONDS_PER_EMQ) / 60);
const [r1, r2, r3] = RETRY_INTERVALS_DAYS;

const REASONS: { title: string; body: string }[] = [
  {
    title: "Current guidance, not recalled questions",
    body: "Every question is written from a named RCOG Green-top Guideline, NICE guideline or high-impact review, so you revise what is recommended now, not what someone remembers from an old paper.",
  },
  {
    title: "Every answer shows where it came from",
    body: "Each explanation cites the passage it relies on. If the citation does not support the answer, the question is discarded, and a Member of the RCOG approves every question before you see it.",
  },
  {
    title: "Kept up to date every quarter",
    body: "When guidance is superseded, the questions written from it are retired and new ones are written from the update. A printed book stays as it was printed.",
  },
  {
    title: "A plan built from your exam date",
    body: "The diagnostic finds your weak topics, the plan gives them more time, secured topics come back on a schedule, and the last fortnight turns into mixed papers. It moves with every answer.",
  },
  {
    title: "Mistakes come back until they stick",
    body: `A question you get wrong returns after ${r1} days, then ${r2}, then ${r3}, so a gap is closed rather than forgotten.`,
  },
  {
    title: "Mocks marked like the real paper",
    body: `${FULL_PAPER.sba} SBAs and ${FULL_PAPER.emq} EMQs, ${SBA_MINUTES} and ${EMQ_MINUTES} minutes as the RCOG recommends, with SBAs worth 40% of the mark and EMQs 60%.`,
  },
  {
    title: "Ask Pinard when an explanation is not enough",
    body: "Ask about anything on the syllabus. Answers come only from the guidance in the library, name their source, and say plainly when the guidance does not cover your question.",
  },
  {
    title: "No risk in trying",
    body: "Start free with the sample diagnostic and 15 questions. If you subscribe, you get a full refund within 14 days, and you can cancel whenever you like.",
  },
];

export function WhyPinard({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div>
      <Heading className="font-serif text-[28px] font-semibold leading-tight text-ink-strong sm:text-[34px]">
        Why revise with Pinard
      </Heading>
      <p className="mt-3 max-w-[40rem] font-ui text-[18px] leading-relaxed text-ink/80">
        More than a bank of questions: every answer traced to its source, guidance kept current, and your revision
        planned around your exam date.
      </p>
      <dl className="mt-8 grid gap-x-10 border-t border-line sm:grid-cols-2">
        {REASONS.map((r) => (
          <div key={r.title} className="border-b border-line py-5">
            <dt className="font-ui text-[17px] font-semibold text-ink-strong">{r.title}</dt>
            <dd className="mt-1.5 font-ui text-[16px] leading-relaxed text-ink/80">{r.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
