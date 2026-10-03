import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSampleSession } from "@/lib/session";
import { getBillingPrices } from "@/lib/billing";

/**
 * The sample a stranger answers without an account.
 *
 * Everything persuasive about this product was behind the sign-in
 * wall: a visitor could read a claim about the explanations but never
 * one. These are real approved questions, answered and marked, with the
 * explanation and the guideline each came from, and then the paywall.
 *
 * Which questions is the owner's decision, not this file's: they are
 * the ones marked `showcase` in Admin → Bank, the same rows the landing
 * page's specimens come from. One place to curate.
 *
 * Signed in, there is nothing here that /practise does not do better,
 * so a signed-in visitor is sent there instead of being shown a sample
 * of something they already have.
 */
export const metadata = {
  title: "Try the questions · Pinard",
  description:
    "Real MRCOG questions from the bank, with the full explanation and the guideline each answer came from. No account needed.",
};

export default async function SamplePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/practise");

  /*
    The service role reads the questions and the prices: approved
    questions and the price rows are not readable to someone who is not
    signed in, and this page's whole audience is exactly that.
  */
  const admin = createAdminClient();
  const [questions, prices] = await Promise.all([
    buildSampleSession(admin),
    getBillingPrices(),
  ]);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader
          title="Nothing to try just yet"
          eyebrow="Sample"
          lede="No questions are featured at the moment. The bank is there behind an account."
        />
        <Link
          href="/sign-up"
          className="inline-block rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
        >
          Create an account
        </Link>
      </>
    );
  }

  const sbas = questions.filter((q) => q.format === "sba").length;
  const emqs = questions.length - sbas;
  const mix = [
    sbas ? `${sbas} single best answer${sbas === 1 ? "" : "s"}` : "",
    emqs ? `${emqs} extended-matching scenario${emqs === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <>
      <TraceHeader
        title="Try the questions"
        eyebrow="No account needed"
        lede={`${mix}, exactly as a subscriber meets them: the same stems, the same explanations, and the guideline each answer came from. Nothing is recorded.`}
      />
      <SessionRunner
        questions={questions}
        title="Sample"
        endCard="paywall"
        prices={prices}
        anonymous
      />
    </>
  );
}
