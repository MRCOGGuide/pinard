import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { TopicTrace } from "@/components/TopicTrace";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanUnits,
  leafSections,
  PASS_THRESHOLD,
  type PerfRow,
} from "@/lib/performance";
import { getAccess, hasFullAccess } from "@/lib/access";
import { summariseDiagnostic } from "@/lib/diagnostic";
import { FreeResults } from "./FreeResults";
import { coveredSectionIds } from "@/lib/plan-service";
import type { Section } from "@/lib/types";

export default async function DiagnosticResultsPage({
  searchParams,
}: {
  /** Which sitting to report, written by the runner when it finishes. */
  searchParams: { s?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  /*
    A free sitting is reported from its own answers rather than from
    rolling topic performance. That measure is built for hundreds of
    answers across a syllabus; fed fifteen, one per sub-topic, it
    returns a column of 0% and 100% and would have the page call a
    candidate weak at a topic on the strength of one question.
  */
  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier) && searchParams.s) {
    const [{ data: answers }, { data: allSections }] = await Promise.all([
      supabase
        .from("user_answers")
        .select("question_id, is_correct, generated_questions!inner(section_id)")
        .eq("user_id", user.id)
        .eq("session_id", searchParams.s),
      supabase.from("sections").select("*").eq("exam", profile.exam),
    ]);

    const sections = (allSections ?? []) as Section[];
    const summary = summariseDiagnostic(
      ((answers ?? []) as unknown as {
        question_id: number;
        is_correct: boolean;
        generated_questions: { section_id: number };
      }[]).map((a) => ({
        questionId: a.question_id,
        correct: a.is_correct,
        sectionId: a.generated_questions.section_id,
      })),
      sections,
      leafSections(sections).length
    );

    return (
      <>
        <TraceHeader
          title="What fifteen questions found"
          eyebrow="Free diagnostic"
          lede="Your score, where the marks went, and how much of the syllabus this could not reach."
        />
        <FreeResults
          summary={summary}
          subTopicsTotal={leafSections(sections).length}
        />
      </>
    );
  }

  const [{ data: sections }, { data: perf }, covered] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam),
    supabase
      .from("user_topic_performance")
      .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
      .eq("user_id", user.id),
    coveredSectionIds(supabase, profile.exam),
  ]);

  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered
  );
  const attempted = units.filter((u) =>
    ((perf ?? []) as PerfRow[]).some((p) => p.section_id === u.section_id)
  );
  const weakest = [...attempted]
    .filter((u) => u.accuracy < PASS_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <>
      <TraceHeader
        title="Your topic map"
        lede="Every topic against the 70% pass threshold. Your plan now front-loads the weakest."
      />

      {weakest.length > 0 ? (
        <div className="mb-6 rounded-card border border-line bg-surface p-5 shadow-card">
          <p className="text-sm leading-relaxed text-ink/85">
            Your plan will focus first on{" "}
            <em className="font-display not-italic text-ink-strong">
              {weakest.map((u) => u.title).join(", ")}
            </em>
            {" "}: the topics with the most ground to gain. Stronger topics
            return for spaced review so they stay secure.
          </p>
        </div>
      ) : attempted.length > 0 ? (
        <div className="mb-6 rounded-card border border-line bg-surface p-5 shadow-card">
          <p className="text-sm text-ink/85">
            A strong start: every attempted topic is at or above the pass
            threshold. Your plan keeps them in rotation so they stay there.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {units.map((u) => (
          <TopicTrace
            key={u.section_id}
            title={u.title}
            series={[]}
            accuracy={u.accuracy}
            attempts={
              ((perf ?? []) as PerfRow[]).find(
                (p) => p.section_id === u.section_id
              )?.attempts ?? 0
            }
            covered={u.covered !== false}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/plan"
          className="rounded-card bg-brand px-5 py-2.5 text-sm font-medium text-on-brand hover:bg-good"
        >
          See my plan
        </Link>
        <Link
          href="/session"
          className="rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
        >
          Start today&rsquo;s session
        </Link>
      </div>
    </>
  );
}
