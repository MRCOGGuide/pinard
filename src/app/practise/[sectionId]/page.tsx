import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import {
  buildRevisionSession,
  buildSamplerSession,
  fetchFlaggedIds,
} from "@/lib/session";
import { getAccess, hasFullAccess, SAMPLER_LIMIT } from "@/lib/access";
import { getBillingPrices } from "@/lib/billing";

/**
 * Ask Pinard runs as a server action from this route, and a server
 * action inherits the limit of the route that hosts it. A grounded
 * answer is retrieval — an embedding call and a vector search, about
 * 830ms warm and several seconds on a cold index — and then a model
 * call over the passages. Ten seconds is the default, and it is not
 * enough for that: the candidate would get a Gateway Timeout instead
 * of an answer, which is what the ten-second budget was already doing
 * to the plan narrative.
 */
export const maxDuration = 60;


export default async function RevisionPage({
  params,
}: {
  params: { sectionId: string };
}) {
  const sectionId = Number(params.sectionId);
  if (!sectionId) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: section } = await supabase
    .from("sections")
    .select("id, title")
    .eq("id", sectionId)
    .single();
  if (!section) notFound();

  const tier = await getAccess(supabase, user.id);
  const full = hasFullAccess(tier);

  // Free tier: a stable 3-question sample with full feedback, then paywall.
  const questions = full
    ? await buildRevisionSession(supabase, sectionId, 10, user.id)
    : await buildSamplerSession(supabase, sectionId, SAMPLER_LIMIT);
  const prices = full ? undefined : await getBillingPrices(supabase);
  const flaggedIds = await fetchFlaggedIds(supabase, user.id);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title={section.title} eyebrow="Free revision" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm text-ink/80">
            No approved questions in this topic yet.
          </p>
          <Link
            href="/practise"
            className="mt-5 inline-block rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Back to topics
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TraceHeader
        title={section.title}
        eyebrow={full ? "Free revision" : "Free sample"}
        lede={
          full
            ? undefined
            : `${questions.length} sample question${questions.length === 1 ? "" : "s"} with full worked feedback.`
        }
      />
      <SessionRunner
        questions={questions}
        title={full ? "Free revision" : "Free sample"}
        endCard={full ? "default" : "paywall"}
        prices={prices}
        flaggedIds={flaggedIds}
      />
    </>
  );
}
