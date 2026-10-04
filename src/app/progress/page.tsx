import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { TopicTrace } from "@/components/TopicTrace";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanUnits,
  currentStreak,
  readiness,
  readinessBand,
  thirdBand,
  type PerfRow,
} from "@/lib/performance";
import { coveredSectionIds } from "@/lib/plan-service";
import { Tally } from "@/components/Tally";
import { fetchSeenIds } from "@/lib/session";
import type { Section } from "@/lib/types";
import { NONE } from "@/components/ui";
import { fetchAll } from "@/lib/supabase/all";

export default async function ProgressPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, exam_date")
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

  /*
    How much of each topic exists, and how much of it they have met.

    Accuracy on its own cannot answer "how am I doing in Contraception":
    80% over five questions of forty is a different thing from 80% over
    forty, and the trace drew them identically. The answered side counts
    distinct questions, because meeting the same one twice is revision
    rather than coverage.
  */
  /*
    Both of these outgrow a plain select. PostgREST caps one at a
    thousand rows and says nothing about it, and the bank passed that
    some time ago: the denominator would have come back as 1,000
    questions spread over the syllabus, which is wrong in the direction
    that looks plausible — every topic would read as more covered than
    it is. An active candidate's answers pass it too.
  */
  const [bankRows, seenRows] = await Promise.all([
    fetchAll<{ id: number; section_id: number }>((from, to) =>
      supabase
        .from("generated_questions")
        .select("id, section_id")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
    ),
    /* The same helper /practise counts "done" with, so the two screens
       cannot disagree about what has been seen. */
    fetchSeenIds(supabase, user.id),
  ]);
  const availableBySection = new Map<number, number>();
  for (const row of bankRows) {
    const sid = row.section_id;
    availableBySection.set(sid, (availableBySection.get(sid) ?? 0) + 1);
  }
  const seenIdsBySection = new Map<number, Set<number>>();
  for (const row of bankRows) {
    /* Walked from the bank rather than from the answers, so a question
       answered and since rejected counts as coverage of nothing: it is
       not in a bank that no longer holds it. */
    if (!seenRows.has(row.id)) continue;
    const set = seenIdsBySection.get(row.section_id) ?? new Set<number>();
    set.add(row.id);
    seenIdsBySection.set(row.section_id, set);
  }

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
  /* Distinct questions, and only ones the bank still holds, so this
     agrees with the same figure on Today. Answers now include retries
     of questions got wrong, and counting those would make someone look
     further through the bank than they are. */
  const answeredInBank = bankRows.filter((r) => seenRows.has(r.id)).length;
  const bankSize = bankRows.length;
  const started = answeredInBank > 0;


  return (
    <>
      <TraceHeader
        title="Progress"
        explain="Every topic traced against the 70% pass threshold."
      />

      {/*
        Four boxes and nothing above them.

        The pace sentence and the next milestone sat in a tinted panel
        over these, which made the first thing on the page a paragraph
        of arithmetic about the figures underneath it. Both are
        derivable from the boxes by anyone who wants them, and the
        questions answered has been promoted out of the grey line
        beneath into a box of its own, which is what it was always
        being read as.
      */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Readiness"
          value={ready.percent}
          suffix="%"
          unstarted={!started}
          band={started ? readinessBand(ready.percent) : undefined}
        />
        <Stat
          label="Topics secured"
          value={ready.secured}
          of={ready.total}
          band={thirdBand(ready.secured, ready.total)}
        />
        <Stat
          label="Questions answered"
          value={answeredInBank}
          of={bankSize}
          band={thirdBand(answeredInBank, bankSize)}
        />
        <Stat label="Day streak" value={streak} accent={streak > 0} />
      </div>

      {units.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-4 text-sm text-ink/60">
          No topics yet for this exam.
        </p>
      ) : (
        grouped.map(([heading, topics]) => {
          // How the section as a whole stands, which is the question a
          // heading invites and the individual traces cannot answer.
          const secured = topics.filter((t) => t.accuracy >= 70).length;
          const seenHere = topics.reduce(
            (n, t) => n + (seenIdsBySection.get(t.section_id)?.size ?? 0),
            0
          );
          const availableHere = topics.reduce(
            (n, t) => n + (availableBySection.get(t.section_id) ?? 0),
            0
          );
          return (
            <section key={heading} className="mb-6">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-mono text-label uppercase tracking-wide text-good">
                  {heading}
                </h2>
                <span className="font-mono text-label text-ink/50">
                  {secured}/{topics.length} at 70%
                  {availableHere > 0 && (
                    <>
                      {" · "}
                      {Math.round((seenHere / availableHere) * 100)}% seen
                    </>
                  )}
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
                    seen={seenIdsBySection.get(u.section_id)?.size ?? 0}
                    available={availableBySection.get(u.section_id) ?? 0}
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

const BAND_INK = {
  red: "text-accent-ink",
  amber: "text-warn",
  green: "text-good",
} as const;

/**
 * One figure in a box, counting up to itself when the page opens.
 *
 * The same Tally the Today strip uses, for the same reason: these are
 * the numbers someone comes to this page to look at, and watching one
 * arrive is what makes it land. `value` is a number rather than a
 * string so it can be animated; `of` is the part that does not move,
 * and `suffix` is the per cent sign.
 */
function Stat({
  label,
  value,
  of,
  suffix = "",
  accent = false,
  band,
  unstarted = false,
}: {
  label: string;
  value: number;
  /** The denominator, printed small and still. */
  of?: number;
  suffix?: string;
  accent?: boolean;
  /** Colours the figure the same way the Today strip colours its own. */
  band?: "red" | "amber" | "green";
  /** Nothing answered yet, so there is no figure to claim. */
  unstarted?: boolean;
}) {
  const ink = band
    ? BAND_INK[band]
    : accent
      ? "text-accent-ink"
      : "text-ink-strong";
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-center shadow-card">
      <p className={`font-mono text-2xl font-medium ${ink}`}>
        {unstarted ? (
          NONE
        ) : (
          <>
            <Tally to={value} />
            {suffix}
            {of !== undefined && (
              <span className="text-base font-normal text-ink/40">
                /{of.toLocaleString("en-GB")}
              </span>
            )}
          </>
        )}
      </p>
      <p className="mt-0.5 text-xs text-ink/60">{label}</p>
    </div>
  );
}
