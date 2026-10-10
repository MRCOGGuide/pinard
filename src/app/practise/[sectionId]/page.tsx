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
import { plansProps } from "@/lib/plansProps";
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
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ sectionId: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const sectionId = Number(params.sectionId);
  if (!sectionId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

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
  const plans = full ? undefined : await plansProps();
  const flaggedIds = await fetchFlaggedIds(supabase, user.id);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title={section.title} eyebrow="Free revision" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm text-ink/80">
            {full
              ? "No approved questions in this topic yet."
              : "This topic isn't in the free sample. Your 15 free questions are spread across the syllabus."}
          </p>
          {!full && (
            <Link
              href="/practise/free"
              className="mt-5 mr-2 btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
            >
              Start the free sample
            </Link>
          )}
          <Link
            href="/practise"
            className="mt-5 inline-block btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
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
        plans={plans}
        flaggedIds={flaggedIds}
      />
    </div>
  );
}
