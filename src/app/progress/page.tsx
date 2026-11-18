import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { ScrollFade } from "@/components/scroll";
import {
  Fact,
  FactsRow,
  NextTopics,
  ReadinessStrip,
  TopicRow,
  WeakGuidelines,
  FormatSplit,
} from "@/components/progress/ProgressParts";
import { formatStanding, weakerFormat } from "@/lib/formats";
import { createAdminClient } from "@/lib/supabase/admin";
import { ModuleCard } from "@/components/ModuleCard";
import { moduleRank } from "@/components/ModuleMark";
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
import { bankShape } from "@/lib/plan-service";
import { overallReadiness, readinessSeries } from "@/lib/readiness";
import { getReadinessModel } from "@/lib/readiness-model";
import type { Readiness } from "@/lib/performance";
import type { ExamPart, QuestionFormat } from "@/lib/types";
import { scoreGuidelines, weakestGuidelines } from "@/lib/guidelines";
import { firstAttempts } from "@/lib/review";
import { fetchSeenIds } from "@/lib/session";
import type { Section } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { fetchAll } from "@/lib/supabase/all";
import { redirectToSignIn } from "@/lib/auth";
import { getAccess, hasFullAccess } from "@/lib/access";
import { localDay } from "@/lib/timezone";
import { candidateZone } from "@/lib/candidateZone";

export default async function ProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();
  // Progress and readiness are part of a subscription, as the plan
  // cards say; a free account's results are on the diagnostic page.
  // Asked at once rather than in turn (13 November 2026, the owner: "make
  // sure the website is fast").
  const [tier, { data: profile }] = await Promise.all([
    getAccess(supabase, user.id),
    supabase.from("profiles").select("exam, exam_date").eq("id", user.id).single(),
  ]);
  if (!hasFullAccess(tier)) redirect("/pricing");
  if (!profile?.exam) redirect("/onboarding");

  const [{ data: sections }, { data: perf }, answers, bankRows, seenRows, { covered, breadth }] =
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
          .select("question_id, is_correct, answered_at, generated_questions!inner(section_id, source_document_ids, format)")
          .eq("user_id", user.id)
          .order("answered_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to)
      ),
      /*
        Both of these outgrow a plain select. PostgREST caps one at a
        thousand rows and says nothing about it, and the bank passed that
        some time ago: the denominator would have come back as 1,000
        questions spread over the syllabus, which is wrong in the direction
        that looks plausible — every topic would read as more covered than
        it is. An active candidate's answers pass it too.
      */
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
      bankShape(supabase, profile.exam),
    ]);

  /*
    How much of each topic exists, and how much of it they have met.

    Accuracy on its own cannot answer "how am I doing in Contraception":
    80% over five questions of forty is a different thing from 80% over
    forty, and the trace drew them identically. The answered side counts
    distinct questions, because meeting the same one twice is revision
    rather than coverage.
  */
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
    covered,
    undefined,
    breadth
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
    question_id: number;
    is_correct: boolean;
    answered_at: string;
    generated_questions: { section_id: number; source_document_ids: number[] | null; format: QuestionFormat };
  }[];

  // SBA and EMQ apart, on first answers (lib/formats).
  const formats = formatStanding(
    answerRows.map((a) => ({
      question_id: a.question_id,
      is_correct: a.is_correct,
      answered_at: a.answered_at,
      format: a.generated_questions.format,
    }))
  );
  const weakerKind = weakerFormat(formats);

  /*
    The guidelines answered worst, across every topic (Phase C, approved
    16 November 2026). A topic's one score can hide a guideline inside it
    answered wrongly every time; this names it. First answers only, as
    topic scores are. Titles are read by the server for these few ids:
    the library itself is not the candidate's to read.
  */
  const docsOfQuestion = new Map(answerRows.map((a) => [a.question_id, a.generated_questions.source_document_ids ?? []]));
  const sectionOfDoc = new Map<number, number>();
  for (const a of answerRows) {
    for (const d of a.generated_questions.source_document_ids ?? []) {
      if (!sectionOfDoc.has(d)) sectionOfDoc.set(d, a.generated_questions.section_id);
    }
  }
  const firstAnswers = new Map(firstAttempts(answerRows).map((a) => [a.question_id, a.is_correct]));
  const weakDocs = weakestGuidelines(scoreGuidelines(firstAnswers, (id) => docsOfQuestion.get(id)), 12);
  const { data: weakTitles } = weakDocs.length
    ? await createAdminClient().from("content_documents").select("id, title").in("id", weakDocs.map((g) => g.documentId))
    : { data: [] as { id: number; title: string }[] };
  const titleOfDoc = new Map((weakTitles ?? []).map((d) => [d.id as number, d.title as string]));
  // One line per guideline: a document held twice in the library is shown once.
  const shownTitles = new Set<string>();
  const weakGuidelines = weakDocs
    .map((g) => ({ ...g, title: titleOfDoc.get(g.documentId) ?? "", sectionId: sectionOfDoc.get(g.documentId) }))
    .filter((g) => {
      const key = g.title.trim().toLowerCase();
      if (!key || shownTitles.has(key)) return false;
      shownTitles.add(key);
      return true;
    })
    .slice(0, 6)
    .map((g) => ({ ...g, topic: g.sectionId ? (titleById.get(g.sectionId) ?? "") : "" }));

  /* Per topic, first answers and how many were right: the plain tally
     shown beside each topic's readiness, so the figure is never a
     percentage of one answer standing alone. */
  const firstList = firstAttempts(answerRows);
  const tally = new Map<number, { answered: number; right: number }>();
  for (const a of firstList) {
    const sid = (a as (typeof answerRows)[number]).generated_questions.section_id;
    const t = tally.get(sid) ?? { answered: 0, right: 0 };
    t.answered += 1;
    if (a.is_correct) t.right += 1;
    tally.set(sid, t);
  }
  const answeredIn = (id: number) => tally.get(id)?.answered ?? 0;

  /* Running accuracy per topic, for the traces if the readiness model
     cannot be read (below, it is replaced by readiness over time). */
  let seriesBySection = new Map<number, number[]>();
  const runningBySection = new Map<number, { correct: number; total: number }>();
  for (const a of firstList) {
    const sid = (a as (typeof answerRows)[number]).generated_questions.section_id;
    const run = runningBySection.get(sid) ?? { correct: 0, total: 0 };
    run.total += 1;
    if (a.is_correct) run.correct += 1;
    runningBySection.set(sid, run);
    seriesBySection.set(sid, [...(seriesBySection.get(sid) ?? []), Math.round((run.correct / run.total) * 100)]);
  }

  /*
    Readiness by guideline (lib/readiness): each topic by how much of its
    guidance has been answered, and how well, weighted by length and
    priority. The topic-level figure stands in if the library cannot be
    read, so the page is never left without one.
  */
  let ready: Readiness = readiness(units);
  let topicReady: Map<number, number> | null = null;
  try {
    const model = await getReadinessModel(profile.exam as ExamPart);
    const byGuideline = overallReadiness(model, firstAnswers, new Set(units.map((u) => u.section_id)));
    ready = byGuideline;
    topicReady = new Map([...byGuideline.topics].map(([id, t]) => [id, t.percent]));
    // Each topic's line is its readiness over time, not its running accuracy.
    seriesBySection = readinessSeries(model, firstList);
  } catch (error) {
    console.error("readiness model unavailable, topic-level figure used:", (error as Error)?.message);
  }
  const securedTopic = (u: { section_id: number; accuracy: number; attempts?: number }) =>
    topicReady
      ? Math.round(topicReady.get(u.section_id) ?? 0) >= PASS_THRESHOLD
      : u.accuracy >= PASS_THRESHOLD && (u.attempts ?? 0) > 0;
  // The first module, at the top, open to begin with, as on Practise (owner, 17 November 2026:
  // the one needing most work opened at the foot of the page).
  const firstModule = [...grouped].sort(([a], [b]) => moduleRank(a) - moduleRank(b))[0]?.[0] ?? null;
  // Days counted in the candidate's own zone, as Today and the plan count them.
  const zone = await candidateZone(user.id);
  const streak = currentStreak(
    answerRows.map((a) => a.answered_at),
    localDay(zone),
    zone
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

  /* A topic's figure: its readiness, what has been shown of it, and the
     topic's running accuracy only if the model cannot be read. */
  const figureOf = (u: { section_id: number; accuracy: number }) =>
    topicReady ? Math.round(topicReady.get(u.section_id) ?? 0) : u.accuracy;

  /* Three topics to look at next: the least shown of those begun, then
     the first untouched ones if fewer than three have been begun. */
  const begun = units
    .filter((u) => answeredIn(u.section_id) > 0 && figureOf(u) < PASS_THRESHOLD)
    .sort((a, b) => figureOf(a) - figureOf(b));
  const untouched = units.filter((u) => answeredIn(u.section_id) === 0);
  const next = [...begun, ...untouched].slice(0, 3).map((u) => ({
    id: u.section_id,
    title: u.title,
    percent: figureOf(u),
    answered: answeredIn(u.section_id),
    right: tally.get(u.section_id)?.right ?? 0,
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

      {weakGuidelines.length > 0 && (
        <ScrollFade as="div">
          <WeakGuidelines guidelines={weakGuidelines} />
        </ScrollFade>
      )}

      {started && (
        <ScrollFade as="div">
          <FormatSplit standing={formats} weaker={weakerKind} />
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
        /*
          Each module a card that opens and closes, as on Practise (owner,
          17 November 2026: "Make the Progress page modules collapsible
          too"), in the same order and with the same emblems; the one with
          the least secured is open to begin with. The note that sat
          behind the heading's (i) opens the card: a button cannot hold
          another.
        */
        <div className="mt-10 space-y-4">
          {[...grouped]
            .sort(([a], [b]) => moduleRank(a) - moduleRank(b))
            .map(([heading, topics]) => {
              // Secured as Readiness counts it: enough of the topic answered, and answered well.
              const securedHere = topics.filter(securedTopic).length;
              const seenHere = topics.reduce((n, t) => n + (seenIdsBySection.get(t.section_id)?.size ?? 0), 0);
              const availableHere = topics.reduce((n, t) => n + (availableBySection.get(t.section_id) ?? 0), 0);
              // Secured topics as a share of the module, and nothing else: 2 of 9 is 22%, and reads red.
              const share = (securedHere / topics.length) * 100;
              return (
                <ModuleCard
                  key={heading}
                  heading={heading}
                  summary={`${topics.length} topic${topics.length === 1 ? "" : "s"}, ${securedHere} secured`}
                  figure={`${Math.round(share)}%`}
                  figureLabel="secured"
                  percent={share}
                  defaultOpen={heading === firstModule}
                >
                  <p className="px-4 pt-3 font-ui text-[14px] leading-relaxed text-ink/70 sm:px-5">
                    A topic is secured when it is answered across enough of its guidance, and well enough, to reach{" "}
                    {PASS_THRESHOLD}%. Each topic&rsquo;s figure is its readiness, so a few right answers in a large topic
                    count for little; the tally under it is your answers there.
                    {availableHere > 0 &&
                      ` You have seen ${Math.round((seenHere / availableHere) * 100)}% of the ${availableHere.toLocaleString("en-GB")} questions this module holds.`}
                  </p>
                  <ul className="mt-2 divide-y divide-line border-t border-line">
                    {topics.map((u) => (
                      <TopicRow
                        key={u.section_id}
                        id={u.section_id}
                        title={u.title}
                        series={seriesBySection.get(u.section_id) ?? []}
                        percent={figureOf(u)}
                        answered={answeredIn(u.section_id)}
                        right={tally.get(u.section_id)?.right ?? 0}
                        seen={seenIdsBySection.get(u.section_id)?.size ?? 0}
                        available={availableBySection.get(u.section_id) ?? 0}
                      />
                    ))}
                  </ul>
                </ModuleCard>
              );
            })}
        </div>
      )}
    </>
  );
}
