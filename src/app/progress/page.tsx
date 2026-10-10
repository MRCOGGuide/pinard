import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { ScrollFade } from "@/components/scroll";
import { GradeBar } from "@/components/GradeBar";
import {
  Fact,
  FactsRow,
  NextTopics,
  ReadinessStrip,
  TopicRow,
} from "@/components/progress/ProgressParts";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanUnits,
  currentStreak,
  readiness,
  readinessBand,
  thirdBand,
  PASS_THRESHOLD,
  type PerfRow,
} from "@/lib/performance";
import { coveredSectionIds } from "@/lib/plan-service";
import { Explain } from "@/components/Explain";
import { fetchSeenIds } from "@/lib/session";
import type { Section } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { fetchAll } from "@/lib/supabase/all";
import { redirectToSignIn } from "@/lib/auth";
import { getAccess, hasFullAccess } from "@/lib/access";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();
  // Progress and readiness are part of a subscription, as the plan
  // cards say; a free account's results are on the diagnostic page.
  if (!hasFullAccess(await getAccess(supabase, user.id))) redirect("/pricing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, exam_date")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const [{ data: sections }, { data: perf }, answers] =
    await Promise.all([
      supabase.from("sections").select("*").eq("exam", profile.exam),
      supabase
        .from("user_topic_performance")
        .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
        .eq("user_id", user.id),
      /* Paged: a plain select stops at a thousand rows without saying
         so, and an active candidate passes that, after which the traces
         stopped moving however much they practised. */
      fetchAll((from, to) =>
        supabase
          .from("user_answers")
          .select("is_correct, answered_at, generated_questions!inner(section_id)")
          .eq("user_id", user.id)
          .order("answered_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
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

  const answerRows = answers as unknown as {
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


  /* Accuracy over the last thirty answers, answer by answer, thinned to
     at most 160 points so a long history still draws as a line. */
  const WINDOW = 30;
  const rolling: number[] = [];
  let hits = 0;
  for (let i = 0; i < answerRows.length; i++) {
    if (answerRows[i].is_correct) hits += 1;
    if (i >= WINDOW && answerRows[i - WINDOW].is_correct) hits -= 1;
    rolling.push(Math.round((hits / Math.min(i + 1, WINDOW)) * 100));
  }
  const every = Math.max(1, Math.ceil(rolling.length / 160));
  const trend = rolling.filter((_, i) => i % every === 0 || i === rolling.length - 1);

  /* Three topics to look at next: the weakest of those begun, then the
     first untouched ones if fewer than three have been begun. */
  const begun = units
    .filter((u) => (seriesBySection.get(u.section_id)?.length ?? 0) > 0 && u.accuracy < PASS_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy);
  const untouched = units.filter((u) => (seriesBySection.get(u.section_id)?.length ?? 0) === 0);
  const next = [...begun, ...untouched].slice(0, 3).map((u) => ({
    id: u.section_id,
    title: u.title,
    accuracy: u.accuracy,
    attempts: seriesBySection.get(u.section_id)?.length ?? 0,
  }));

  return (
    <>
      <TraceHeader title="Progress" />

      <ScrollFade as="div">
        <ReadinessStrip percent={ready.percent} started={started} series={trend} />
        <FactsRow>
          <Fact
            label="Topics secured"
            value={ready.secured}
            of={ready.total}
            band={thirdBand(ready.secured, ready.total)}
          />
          <Fact
            label="Questions answered"
            value={answeredInBank}
            of={bankSize}
            band={thirdBand(answeredInBank, bankSize)}
          />
          <Fact label="Day streak" value={streak} />
        </FactsRow>
      </ScrollFade>

      {started && (
        <ScrollFade as="div">
          <NextTopics topics={next} />
        </ScrollFade>
      )}

      {units.length === 0 ? (
        <div className="mt-10">
          <EmptyState title="No topics yet">
            Questions for this paper are still being written and approved. Your
            progress appears here as soon as there is something to practise.
          </EmptyState>
        </div>
      ) : (
        grouped.map(([heading, topics]) => {
          const begunHere = topics.filter((t) => (seriesBySection.get(t.section_id)?.length ?? 0) > 0);
          const counts = { red: 0, amber: 0, green: 0, untouched: topics.length - begunHere.length };
          for (const t of begunHere) counts[readinessBand(t.accuracy)] += 1;
          const seenHere = topics.reduce(
            (n, t) => n + (seenIdsBySection.get(t.section_id)?.size ?? 0),
            0
          );
          const availableHere = topics.reduce(
            (n, t) => n + (availableBySection.get(t.section_id) ?? 0),
            0
          );
          return (
            <ScrollFade key={heading} className="mt-10">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h2 className="font-display text-[22px] font-semibold text-ink-strong">
                  {heading}
                  <Explain label={heading}>
                    {counts.green} of {topics.length} topic
                    {topics.length === 1 ? "" : "s"} here at {PASS_THRESHOLD}% or
                    above
                    {availableHere > 0 && (
                      <>
                        , and you have seen{" "}
                        {Math.round((seenHere / availableHere) * 100)}% of the{" "}
                        {availableHere} questions this module holds
                      </>
                    )}
                    .
                  </Explain>
                </h2>
                <p className="font-ui text-[14px] tabular-nums text-ink/65">
                  {counts.green} of {topics.length} secured
                </p>
              </div>
              {/* Secured topics as a share of the module, and nothing else:
                  topics begun but under the pass mark are not progress
                  towards securing it. 2 of 9 is 22%, and reads red. */}
              <GradeBar percent={(counts.green / topics.length) * 100} className="mt-2 h-2" />
              <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                {topics.map((u) => (
                  <TopicRow
                    key={u.section_id}
                    id={u.section_id}
                    title={u.title}
                    series={seriesBySection.get(u.section_id) ?? []}
                    accuracy={u.accuracy}
                    attempts={seriesBySection.get(u.section_id)?.length ?? 0}
                    seen={seenIdsBySection.get(u.section_id)?.size ?? 0}
                    available={availableBySection.get(u.section_id) ?? 0}
                  />
                ))}
              </ul>
            </ScrollFade>
          );
        })
      )}
    </>
  );
}
