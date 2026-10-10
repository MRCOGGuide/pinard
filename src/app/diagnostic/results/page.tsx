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
import { freePlanPreview, summariseDiagnostic } from "@/lib/diagnostic";
import { FreeResults } from "./FreeResults";
import { coveredSectionIds } from "@/lib/plan-service";
import type { Section } from "@/lib/types";
import { redirectToSignIn } from "@/lib/auth";

export default async function DiagnosticResultsPage({
  searchParams: searchParamsPromise,
}: {
  /** Which sitting to report, written by the runner when it finishes. */
  searchParams: Promise<{ s?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  /*
    A free sitting is reported from its own answers rather than from
    rolling topic performance. That measure is built for hundreds of
    answers across a syllabus; fed one item per section, it
    returns a column of 0% and 100% and would have the page call a
    candidate weak at a topic on the strength of one question.
  */
  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) {
    /* The sitting named by the runner, or, coming back later, the most
       recent sitting of the fixed questions. */
    let sitting = searchParams.s ?? null;
    const { data: pinned } = await supabase.from("free_diagnostic_items").select("question_id");
    const ids = ((pinned ?? []) as { question_id: number }[]).map((r) => r.question_id);
    if (!sitting) {
      if (ids.length > 0) {
        const { data: last } = await supabase
          .from("user_answers")
          .select("session_id")
          .eq("user_id", user.id)
          .in("question_id", ids)
          .not("session_id", "is", null)
          .order("answered_at", { ascending: false })
          .limit(1);
        sitting = (last?.[0]?.session_id as string | undefined) ?? null;
      }
    }
    if (!sitting) redirect("/diagnostic");

    const [{ data: answers }, { data: allSections }, { data: examRow }] = await Promise.all([
      supabase
        .from("user_answers")
        .select("question_id, is_correct, generated_questions!inner(section_id, difficulty)")
        .eq("user_id", user.id)
        .eq("session_id", sitting),
      supabase.from("sections").select("*").eq("exam", profile.exam),
      supabase.from("profiles").select("exam_date").eq("id", user.id).single(),
    ]);

    const sections = (allSections ?? []) as Section[];
    const rows = (answers ?? []) as unknown as {
      question_id: number;
      is_correct: boolean;
      generated_questions: { section_id: number; difficulty: number | null };
    }[];
    const summary = summariseDiagnostic(
      rows.map((a) => ({
        questionId: a.question_id,
        correct: a.is_correct,
        sectionId: a.generated_questions.section_id,
      })),
      sections,
      leafSections(sections).length
    );
    const preview = freePlanPreview(
      rows.map((a) => ({
        sectionId: a.generated_questions.section_id,
        correct: a.is_correct,
        difficulty: a.generated_questions.difficulty,
      })),
      sections
    );
    const examDate = examRow?.exam_date as string | null | undefined;
    const examWeeks = examDate
      ? Math.max(0, Math.floor((new Date(examDate).getTime() - Date.now()) / (7 * 86_400_000)))
      : null;

    return (
      <>
        <TraceHeader
          title="What the sample diagnostic found"
          eyebrow="Free sample diagnostic"
          lede="Your score, where the marks went, and a preview of the plan they point to."
        />
        <FreeResults
          summary={summary}
          preview={preview}
          examWeeks={examWeeks}
          unanswered={Math.max(0, ids.length - rows.length)}
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
          <p className="font-ui text-[16px] leading-relaxed text-ink/85">
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
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
        >
          See my plan
        </Link>
        <Link
          href="/session"
          className="btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
        >
          Start today&rsquo;s session
        </Link>
      </div>
    </>
  );
}
