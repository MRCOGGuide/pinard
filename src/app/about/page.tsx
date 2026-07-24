import Link from "next/link";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";

export const metadata: Metadata = {
  title: "How Pinard works — intelligent MRCOG revision",
  description:
    "Evidence-grounded MRCOG revision: a diagnostic that finds your weak areas, an adaptive plan that targets them, and questions approved by MRCOG-qualified reviewers and updated monthly against the latest guidelines.",
};

function Feature({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-hairline bg-porcelain p-5 shadow-card">
      <h3 className="font-display text-lg font-semibold text-theatre">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-graphite/80">{children}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <>
      <TraceHeader
        title="How Pinard works"
        lede="Intelligent MRCOG revision, grounded in the evidence — built to give you the strongest possible preparation for exam day."
      />

      <p className="mb-4 text-sm leading-relaxed text-graphite/85">
        Pinard is named after the stethoscope that listens. The product listens
        to your knowledge, finds precisely where you are weakest, and drives a
        revision plan that strengthens those areas first — so your study time
        goes where it changes your score the most.
      </p>

      <div className="mb-6 rounded-card border border-greentop/40 bg-porcelain p-5 shadow-card">
        <h2 className="font-display text-lg font-semibold text-theatre">
          Why Pinard exists
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-graphite/80">
          Most candidates revise from a patchwork of resources — and many rely
          on textbooks and question banks published years ago. The evidence
          this exam tests does not stand still: RCOG Green-top Guidelines,
          TOG articles and NICE guidance are revised continually, and a book
          begins to date the day it is printed. Pinard closes that gap.{" "}
          <strong className="text-theatre">
            Our questions and source library are refreshed monthly against the
            latest published guidance
          </strong>
          , so you prepare from what the examiners are reading now — not what
          was true three editions ago.
        </p>
      </div>

      <div className="space-y-3">
        <Feature title="Grounded in the evidence">
          Every question, answer and explanation is generated{" "}
          <em>only</em> from source material we curate — the guidelines this
          exam is built on, including RCOG Green-top Guidelines, NICE, ESHRE,
          BSGE, BASHH and others. Each explanation cites the passage it came
          from, so you can always trace a fact back to its source. Nothing is
          invented.
        </Feature>

        <Feature title="Start with a diagnostic screening test">
          Before you revise, you sit a short screening exam that samples every
          topic in the syllabus. Pinard uses your results to map your
          strengths and weaknesses across the whole curriculum — an honest
          picture of where you stand today.
        </Feature>

        <Feature title="Focused, adaptive revision">
          Your plan front-loads your weakest topics and keeps working each one
          until it sits at or above the 70% pass threshold. Stronger topics
          return on a spaced-repetition schedule so they stay secure, and the
          final fortnight shifts to mixed mock papers under exam conditions.
          The plan rebuilds itself automatically as your performance changes or
          your exam date moves.
        </Feature>

        <Feature title="The full breadth of the syllabus">
          Coverage spans both the clinical and the basic-science, non-clinical
          knowledge the MRCOG demands — SBAs and true extended-matching
          questions in the exam&rsquo;s own format — so you prepare across the
          whole curriculum rather than a narrow slice of it.
        </Feature>

        <Feature title="Approved by those who have been through it">
          Every question is approved by Members of the Royal College of
          Obstetricians and Gynaecologists — clinicians who have passed the
          MRCOG themselves and understand exactly how demanding the
          preparation is. Nothing reaches you without passing that human
          review, on top of automated checks that every citation genuinely
          supports its answer.
        </Feature>

        <Feature title="Updated monthly — never an outdated book">
          Guidance changes, and so does Pinard. As guidelines and TOG
          articles are released or revised by the royal colleges and
          specialist societies, the library and question bank are updated on
          a monthly cycle, with superseded material retired — so you revise
          from what is current, not what was current three years ago.
        </Feature>

        <Feature title="A serious tool at a sensible price">
          For a fraction of the cost of a face-to-face revision course, you get
          an adaptive tutor that works around your exam date, targets your
          weak spots, and is available whenever you are — on the ward, on call,
          or on the commute. Start free with sample questions in every topic,
          and upgrade only when it&rsquo;s clearly working for you.
        </Feature>
      </div>

      <div className="mt-6 rounded-card border border-heartbeat/30 bg-porcelain p-4">
        <p className="text-sm leading-relaxed text-graphite/80">
          <strong className="text-theatre">An honest promise.</strong> Pinard is
          a revision aid designed to give you the best possible preparation. It
          is not a source of clinical advice, and no revision tool — ours
          included — can guarantee that you will pass. What we can promise is
          disciplined, evidence-grounded practice aimed squarely at the areas
          that will move your result.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/sign-up"
          className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Create a free account
        </Link>
        <Link
          href="/pricing"
          className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
        >
          See pricing
        </Link>
        <Link
          href="/faq"
          className="rounded-card px-5 py-2.5 text-sm font-medium text-greentop hover:text-theatre"
        >
          Read the FAQ
        </Link>
      </div>
    </>
  );
}
