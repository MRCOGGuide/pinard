import Link from "next/link";
import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { Question } from "@/components/Questions";

export const metadata: Metadata = {
  title: "FAQ: Pinard",
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
        and drives focused practice until every topic reaches Pinard&rsquo;s
        70% target. See{" "}
        <Link href="/about" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
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
        Create an account, choose your exam part and date, then take the{" "}
        <strong>diagnostic</strong>. With a subscription, your personal plan
        and daily sessions then appear on the <em>Today</em> page; use{" "}
        <em>Practise</em> to revise any topic off-plan, and <em>Progress</em> to
        see each topic traced against Pinard&rsquo;s 70% target. On a free account you
        get the sample diagnostic and a preview of your plan.
      </>
    ),
  },
  {
    q: "What is the diagnostic screening test?",
    a: (
      <>
        A test across every section of the syllabus, with no feedback until the
        end, so your plan can target your weak areas first. The free sample
        diagnostic asks 35 questions, a single best answer or a pair of EMQ
        scenarios from each section it covers, the same sample for every free
        account, and you can see your results so
        far once you have answered 20. The full diagnostic, for subscribers,
        asks two single best answers and an EMQ set from each section, at mixed
        difficulty, and saves your place so it can be done over several
        sittings. Both tell you the time to allow before you start, and either
        can be sat again every 28 days.
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
        practice across the syllabus, with full timed papers on the Mock page.
        The plan regenerates automatically as your performance
        changes or your exam date moves.
      </>
    ),
  },
  {
    q: "Where do the questions come from?",
    a: (
      <>
        Every question and explanation is built only from source guidelines we
        curate (RCOG, NICE, ESHRE, BSGE and others), never invented, never
        recycled from old question banks. Each explanation names the guideline
        and edition it came from, so you can check every fact at its source.
      </>
    ),
  },
  {
    q: "Who reviews the questions?",
    a: (
      <>
        Every question is approved by a Member of the Royal College of
        Obstetricians and Gynaecologists, acting independently of the College:
        a clinician who has passed the MRCOG
        and knows first-hand how demanding the preparation is. That
        human approval sits on top of automated checks that each answer is
        genuinely supported by its cited guideline.
      </>
    ),
  },
  {
    q: "What happens if a question is wrong?",
    a: (
      <>
        Use Report under the question and say what is wrong. The clinician who
        approves the questions reads every report, checks it against the
        guideline, and corrects the question or withdraws it from the bank.
      </>
    ),
  },
  {
    q: "How current is the content?",
    a: (
      <>
        Textbooks date quickly: RCOG Green-top Guidelines, NICE guidance and
        review articles are revised continually. When a new edition is
        published, the one it replaces is retired from Pinard&rsquo;s library
        along with the questions written from it, so you revise from what is
        current rather than from an outdated book.
      </>
    ),
  },
  {
    q: "Which parts of the MRCOG does Pinard cover?",
    a: (
      <>
        Part 2 today: the question bank, diagnostic, plan and mock papers are
        written for it. Part 1 and Part 3 are not available yet: to hear when
        either opens, email us from the{" "}
        <Link href="/contact" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
          Contact
        </Link>{" "}
        page.
      </>
    ),
  },
  {
    q: "How do I contact you?",
    a: (
      <>
        By email, telephone or post: the details are on the{" "}
        <Link href="/contact" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
          Contact
        </Link>{" "}
        page. To report a question you think is wrong, use Report under the
        question: it reaches the clinician who approves the questions.
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
        Fifteen sample questions from across the syllabus, each with full worked
        feedback, so you can judge the quality before subscribing; the sample
        diagnostic; and a preview of the first fortnight of your plan. The full
        bank, the full diagnostic, the full plan, daily sessions, progress,
        reminders, mock papers and Ask Pinard are part of a subscription.
      </>
    ),
  },
  {
    q: "What does it cost, and can I cancel?",
    a: (
      <>
        See the{" "}
        <Link href="/pricing" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
          pricing page
        </Link>{" "}
        for the plans and your price. There are three, Basic, Plus and Premium,
        monthly or every three months; they include the same app and differ in
        how many Ask Pinard questions they include. Subscriptions renew
        automatically until you cancel; you can cancel any time from{" "}
        <em>Account → Manage billing or cancel</em>, and you keep access until
        the end of the paid period.
      </>
    ),
  },
  {
    q: "What is your refund policy?",
    a: (
      <>
        A full refund within 14 days of your first payment, wherever you live
        and with no questions asked. Within those 14 days you can withdraw
        from your Account page in two clicks. Full details are on the{" "}
        <Link href="/refunds" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
          Refunds, Cancellation &amp; Withdrawal
        </Link>{" "}
        page.
      </>
    ),
  },
  {
    q: "Can I share my account?",
    a: (
      <>
        No: an account is for one person, and only one device can be signed in
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
        <Link href="/privacy" className="text-good underline decoration-good/40 underline-offset-2 hover:decoration-good">
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
      {/* Open on resting the mouse, held open by a click (Question). */}
      <div className="space-y-3">
        {faqs.map((item) => (
          <Question key={item.q} q={item.q}>
            <p>{item.a}</p>
          </Question>
        ))}
      </div>
    </>
  );
}
