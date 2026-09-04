import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { TopicTrace } from "@/components/TopicTrace";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanUnits,
  currentStreak,
  readiness,
  type PerfRow,
} from "@/lib/performance";
import { coveredSectionIds } from "@/lib/plan-service";
import type { Section } from "@/lib/types";

export default async function ProgressPage() {
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

  const [{ data: sections }, { data: perf }, { data: answers }] =
    await Promise.all([
      supabase.from("sections").select("*").eq("exam", profile.exam),
      supabase
        .from("user_topic_performance")
        .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
        .eq("user_id", user.id),
      supabase
        .from("user_answers")
        .select("is_correct, answered_at, generated_questions!inner(section_id)")
        .eq("user_id", user.id)
        .order("answered_at", { ascending: true }),
    ]);

  const covered = await coveredSectionIds(supabase, profile.exam);
  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered
  );

  const answerRows = (answers ?? []) as unknown as {
    is_correct: boolean;
    answered_at: string;
    generated_questions: { section_id: number };
  }[];

  // Per-section cumulative-accuracy series for the traces.
  const seriesBySection = new Map<number, number[]>();
  const runningBySection = new Map<number, { correct: number; total: number }>();
  for (const a of answerRows) {
    const sid = a.generated_questions.section_id;
    const run = runningBySection.get(sid) ?? { correct: 0, total: 0 };
    run.total += 1;
    if (a.is_correct) run.correct += 1;
    runningBySection.set(sid, run);
    const list = seriesBySection.get(sid) ?? [];
    list.push(Math.round((run.correct / run.total) * 100));
    seriesBySection.set(sid, list);
  }

  const ready = readiness(units);
  const streak = currentStreak(
    answerRows.map((a) => a.answered_at),
    new Date().toISOString().slice(0, 10)
  );
  const totalAnswered = answerRows.length;
  const started = totalAnswered > 0;

  return (
    <>
      <TraceHeader
        title="Progress"
        lede="Every topic traced against the 70% pass threshold."
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="Readiness" value={started ? `${ready.percent}%` : "—"} />
        <Stat label="Topics secured" value={`${ready.secured}/${ready.total}`} />
        <Stat label="Day streak" value={String(streak)} accent={streak > 0} />
      </div>
      <p className="mb-6 font-mono text-xs text-graphite/55">
        {totalAnswered} question{totalAnswered === 1 ? "" : "s"} answered
      </p>

      {units.length === 0 ? (
        <p className="rounded-card border border-hairline bg-porcelain p-4 text-sm text-graphite/60">
          No topics yet for this exam.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {units.map((u) => (
            <TopicTrace
              key={u.section_id}
              title={u.title}
              series={seriesBySection.get(u.section_id) ?? []}
              accuracy={u.accuracy}
              attempts={(seriesBySection.get(u.section_id) ?? []).length}
              covered={u.covered !== false}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-hairline bg-porcelain p-4 text-center shadow-card">
      <p
        className={`font-mono text-2xl font-medium ${accent ? "text-heartbeat" : "text-theatre"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-graphite/60">{label}</p>
    </div>
  );
}
