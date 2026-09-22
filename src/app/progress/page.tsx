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
  /*
    Only topics the bank can serve.

    A section with no questions has no answers, so it reports 0% and
    bands as weak — and on this screen that reads as the candidate's
    weakest topic rather than an empty shelf. Postoperative care has no
    RCOG documents ingested yet and sat at the top of the list it is
    least deserved by. It also dragged readiness down, which is a
    number about the candidate, not about the library.

    The plan already worked this way; the screen reporting on the plan
    did not.
  */
  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered
  ).filter((u) => covered.has(u.section_id));

  /*
    Under the heading each topic belongs to, as Practise now is. A
    candidate has to be able to see how they stand across a whole
    syllabus section, and thirty-five traces in one grid does not
    answer that — it is a wall to be scanned, not a picture of where
    the weak half of Obstetrics is.

    A top-level topic is its own heading: TOG Articles hangs off
    nothing and is the largest topic in the bank.
  */
  const titleById = new Map(((sections ?? []) as Section[]).map((s) => [s.id, s.title]));
  const parentOf = new Map(
    ((sections ?? []) as Section[]).map((s) => [s.id, s.parent_id])
  );
  const grouped: [string, typeof units][] = [];
  for (const unit of units) {
    const parentId = parentOf.get(unit.section_id) ?? null;
    const heading =
      (parentId ? titleById.get(parentId) : null) ?? unit.title;
    const existing = grouped.find(([title]) => title === heading);
    if (existing) existing[1].push(unit);
    else grouped.push([heading, [unit]]);
  }

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
      <p className="mb-6 font-mono text-xs text-ink/55">
        {totalAnswered} question{totalAnswered === 1 ? "" : "s"} answered
      </p>

      {units.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink/60">
          No topics yet for this exam.
        </p>
      ) : (
        grouped.map(([heading, topics]) => {
          // How the section as a whole stands, which is the question a
          // heading invites and the individual traces cannot answer.
          const secured = topics.filter((t) => t.accuracy >= 70).length;
          return (
            <section key={heading} className="mb-6">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-mono text-[11px] uppercase tracking-wide text-good">
                  {heading}
                </h2>
                <span className="font-mono text-[11px] text-ink/50">
                  {secured}/{topics.length} at 70%
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {topics.map((u) => (
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
            </section>
          );
        })
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
    <div className="rounded-card border border-line bg-surface p-4 text-center shadow-card">
      <p
        className={`font-mono text-2xl font-medium ${accent ? "text-accent-ink" : "text-ink-strong"}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink/60">{label}</p>
    </div>
  );
}
