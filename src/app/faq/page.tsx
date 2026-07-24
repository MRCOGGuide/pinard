import Link from "next/link";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";

export const metadata: Metadata = {
  title: "FAQ — Pinard",
  description:
    "How Pinard works, the diagnostic, subscriptions, refunds and getting around the app.",
};

const faqs: { q: string; a: React.ReactNode }[] = [
  {
    q: "What is Pinard?",
    a: (
      <>
        An intelligent revision platform for the MRCOG examinations. It builds
        an adaptive study plan around your exam date, finds your weakest topics,
        and drives focused practice until every topic reaches the pass
        threshold. See{" "}
        <Link href="/about" className="text-greentop">
          How Pinard works
        </Link>{" "}
        for the full picture.
      </>
    ),
  },
  {
    q: "How do I get started?",
    a: (
      <>
        Create an account, choose your exam part and date, then take the short{" "}
        <strong>diagnostic screening test</strong>. From there, your personal
        plan and daily sessions appear on the <em>Today</em> page. Use{" "}
        <em>Practise</em> to revise any topic off-plan, and <em>Progress</em> to
        see each topic traced against the 70% pass line.
      </>
    ),
  },
  {
    q: "What is the diagnostic screening test?",
    a: (
      <>
        A short exam that samples questions from every topic in the syllabus. It
        measures where you stand across the whole curriculum so your plan can
        target your weak areas first. You can retake it later to refresh the
        picture.
      </>
    ),
  },
  {
    q: "How does the focused revision work?",
    a: (
      <>
        Topics below 70% are weighted so they appear more often, in proportion
        to how far below the line they sit. Topics you have secured return on a
        spaced-repetition schedule, and the final fortnight switches to mixed
        mock papers. The plan regenerates automatically as your performance
        changes or your exam date moves.
      </>
    ),
  },
  {
    q: "Where do the questions come from?",
    a: (
      <>
        Every question and explanation is built only from source guidelines we
        curate (RCOG, NICE, ESHRE, BSGE and others) — never invented, never
        recycled from old question banks. Each explanation cites the exact
        passage it came from, so you can trace every fact to its source.
      </>
    ),
  },
  {
    q: "Who reviews the questions?",
    a: (
      <>
        Every question is approved by Members of the Royal College of
        Obstetricians and Gynaecologists — clinicians who have passed the MRCOG
        themselves and know first-hand how demanding the preparation is. That
        human approval sits on top of automated checks that each answer is
        genuinely supported by its cited guideline.
      </>
    ),
  },
  {
    q: "How current is the content?",
    a: (
      <>
        Textbooks date quickly — RCOG Green-top Guidelines, TOG articles and
        NICE guidance are revised continually. Pinard&rsquo;s library and
        question bank are refreshed on a monthly cycle against the latest
        published guidance, and superseded material is retired, so you revise
        from what is current rather than from an outdated book.
      </>
    ),
  },
  {
    q: "Will Pinard guarantee I pass?",
    a: (
      <>
        No. Pinard is a revision aid built to give you the strongest possible
        preparation, but no tool can guarantee an exam result. It is also not a
        source of clinical advice.
      </>
    ),
  },
  {
    q: "What do I get for free?",
    a: (
      <>
        Three sample questions per section, each with full worked feedback, so
        you can judge the quality before subscribing. The diagnostic, the
        adaptive plan and unlimited daily sessions are part of a subscription.
      </>
    ),
  },
  {
    q: "What does it cost, and can I cancel?",
    a: (
      <>
        See the{" "}
        <Link href="/pricing" className="text-greentop">
          pricing page
        </Link>{" "}
        for current plans. Subscriptions renew automatically; you can cancel any
        time from <em>Account → Manage billing</em>, and you keep access until
        the end of the paid period.
      </>
    ),
  },
  {
    q: "What is your refund policy?",
    a: (
      <>
        Consumers in the EU, UK and Ireland have a statutory cooling-off right,
        and we offer a satisfaction refund on top of that. Full details are on
        the{" "}
        <Link href="/refunds" className="text-greentop">
          Refund &amp; Cancellation Policy
        </Link>{" "}
        page.
      </>
    ),
  },
  {
    q: "Can I share my account?",
    a: (
      <>
        No — an account is for one person, and only one device can be signed in
        at a time. Signing in elsewhere signs out the previous session.
      </>
    ),
  },
  {
    q: "Can I change my exam date?",
    a: (
      <>
        Yes. Go to <em>Account → Your exam → Change</em>. Your plan rebuilds
        around the new date automatically.
      </>
    ),
  },
  {
    q: "How is my data handled?",
    a: (
      <>
        See our{" "}
        <Link href="/privacy" className="text-greentop">
          Privacy Policy
        </Link>
        . In short: we store your account and revision progress to run the
        service, payments are handled securely by Stripe (we never see your card
        details), and you have full rights over your data under GDPR.
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <>
      <TraceHeader
        title="Frequently asked questions"
        lede="The essentials on how Pinard works, subscriptions and your data."
      />
      <div className="space-y-3">
        {faqs.map((item) => (
          <details
            key={item.q}
            className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
          >
            <summary className="cursor-pointer font-display text-base font-semibold text-theatre">
              {item.q}
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-graphite/80">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </>
  );
}
