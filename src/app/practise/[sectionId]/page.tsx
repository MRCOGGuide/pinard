import Link from "next/link";
import { notFound } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { LeaveSession } from "@/components/LeaveSession";
import { createClient } from "@/lib/supabase/server";
import {
  buildRevisionSession,
  buildSamplerSession,
  fetchFlaggedIds,
} from "@/lib/session";
import { getAccess, hasFullAccess, SAMPLER_LIMIT } from "@/lib/access";
import { getBillingPrices } from "@/lib/billing";
import { redirectToSignIn } from "@/lib/auth";

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
  searchParams,
}: {
  params: { sectionId: string };
  searchParams: { format?: string };
}) {
  const sectionId = Number(params.sectionId);
  if (!sectionId) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirectToSignIn();

  const { data: section } = await supabase
    .from("sections")
    .select("id, title")
    .eq("id", sectionId)
    .single();
  if (!section) notFound();

  const tier = await getAccess(supabase, user.id);
  const full = hasFullAccess(tier);

  // Free tier: a stable 3-question sample with full feedback, then paywall.
  // The format chosen on the topic list, carried through so a run of
  // EMQs is a run of EMQs.
  const format =
    searchParams.format === "sba" || searchParams.format === "emq"
      ? searchParams.format
      : undefined;
  const questions = full
    ? await buildRevisionSession(supabase, sectionId, 10, user.id, format)
    : await buildSamplerSession(supabase, sectionId, SAMPLER_LIMIT);
  const prices = full ? undefined : await getBillingPrices();
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
            className="mt-5 inline-block inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
          >
            Back to topics
          </Link>
        </div>
      </>
    );
  }

  return (
    // The editorial direction, on the question screen (Phase 9 prototype).
    <div>
      <TraceHeader
        title={section.title}
        eyebrow={full ? "Free revision" : "Free sample"}
        lede={
          full
            ? undefined
            : `${questions.length} sample question${questions.length === 1 ? "" : "s"} with full worked feedback.`
        }
      />
      <LeaveSession
        href={`/practise${format ? `?format=${format}` : ""}`}
        label="Exit to topics"
      />
      <SessionRunner
        questions={questions}
        title={full ? "Free revision" : "Free sample"}
        endCard={full ? "default" : "paywall"}
        prices={prices}
        flaggedIds={flaggedIds}
      />
    </div>
  );
}
