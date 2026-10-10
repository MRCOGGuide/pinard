import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { leafSections } from "@/lib/performance";
import { fetchFlaggedIds, fetchSeenIds } from "@/lib/session";
import { CoverageBar } from "@/components/CoverageBar";
import { fetchAll } from "@/lib/supabase/all";
import {
  EXAM_LABELS,
  type ExamPart,
  type QuestionFormat,
  type Section,
} from "@/lib/types";
import { redirectToSignIn } from "@/lib/auth";
import { getAccess, hasFullAccess } from "@/lib/access";
import { ScrollFade } from "@/components/scroll";

export default async function PractisePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ format?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();
  const full = hasFullAccess(await getAccess(supabase, user.id));

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const { data: sections } = await supabase
    .from("sections")
    .select("*")
    .eq("exam", profile.exam)
    .order("sort_order");

  const all = (sections ?? []) as Section[];
  const units = leafSections(all);
  // A topic's parent — Obstetrics, Gynaecology, TOG — so the list reads
  // as the syllabus does rather than as 35 headings in a row.
  const titleById = new Map(all.map((s) => [s.id, s.title]));

  const format: QuestionFormat | "all" =
    searchParams.format === "sba" || searchParams.format === "emq"
      ? searchParams.format
      : "all";
  const flaggedCount = (await fetchFlaggedIds(supabase, user.id)).length;

  // Approved-question counts per section, so users see what's
  // practisable — and how much of each they have already worked
  // through, which is what the coverage bar reports.
  /*
    Paged, because PostgREST stops at 1000 rows and says nothing about
    it. The bank passed that a while ago, so every count on this screen
    was quietly wrong — the "Both" tab read exactly 1000 against a bank
    of 1362, and the per-topic counts were short by whatever fell off
    the end.
  */
  const approved = await fetchAll<{
    id: number;
    section_id: number;
    format: QuestionFormat;
  }>((from, to) =>
    supabase
      .from("generated_questions")
      .select("id, section_id, format")
      .eq("status", "approved")
      .range(from, to)
  );
  const seen = await fetchSeenIds(supabase, user.id);

  const counts = new Map<number, number>();
  const done = new Map<number, number>();
  const rows = approved;
  for (const row of rows) {
    if (format !== "all" && row.format !== format) continue;
    counts.set(row.section_id, (counts.get(row.section_id) ?? 0) + 1);
    if (seen.has(row.id)) {
      done.set(row.section_id, (done.get(row.section_id) ?? 0) + 1);
    }
  }
  // Totals for the tabs, so a format that would show nothing says so
  // before it is chosen rather than after.
  const perFormat = { all: 0, sba: 0, emq: 0 };
  for (const row of rows) {
    perFormat.all += 1;
    perFormat[row.format] += 1;
  }

  /*
    Only topics that can actually be practised.

    An empty topic used to sit in the list greyed out, labelled "No
    questions yet". It is an honest label and the wrong thing to show:
    a candidate paying for a question bank counts the topics it does
    not cover, and a syllabus heading with nothing behind it reads as a
    gap in the product rather than a gap in the library. Postoperative
    care has no RCOG documents ingested yet, so it had nothing.

    Derived, not configured: a topic appears the moment its first
    question is approved, and needs nobody to remember to reveal it.
  */
  const practisable = units.filter((s) => (counts.get(s.id) ?? 0) > 0);

  /*
    Grouped under the heading each topic sits below — Obstetrics,
    Gynaecology, the TOG sections — in syllabus order. Thirty-five
    topics in one flat grid is a list to be searched; under their own
    headings it is the syllabus, which is how a candidate already
    thinks about what to revise.
  */
  const grouped: [string, Section[]][] = [];
  for (const topic of practisable) {
    // A top-level topic is its own heading — TOG Articles hangs off
    // nothing and is the largest topic in the bank, so "Other" was both
    // unhelpful and where a candidate would look last.
    const parent = topic.parent_id ? titleById.get(topic.parent_id) : null;
    const heading = parent ?? topic.title;
    const existing = grouped.find(([title]) => title === heading);
    if (existing) existing[1].push(topic);
    else grouped.push([heading, [topic]]);
  }

  return (
    <>
      <TraceHeader
        title="Practise"
        explain={`Any ${EXAM_LABELS[profile.exam as ExamPart]} topic, off-plan. Everything you answer still counts towards your progress.`}
      />

      {!full && (
        <Link
          href="/practise/free"
          className="mb-6 flex min-h-12 items-center justify-between gap-3 rounded-card border border-good/40 bg-good/5 px-4 py-3 transition-colors duration-fast hover:border-good"
        >
          <span className="font-ui text-[16px] font-semibold text-ink-strong">Your free sample: 15 questions across the syllabus</span>
          <span className="font-ui text-[14px] font-semibold text-good">Start</span>
        </Link>
      )}

      {flaggedCount > 0 && (
        <Link
          href="/practise/flagged"
          className="mb-6 flex min-h-12 items-center justify-between gap-3 rounded-card border border-warn/40 bg-warn/5 px-4 py-3 transition-colors duration-fast hover:border-warn"
        >
          <span className="inline-flex items-center gap-2 font-ui text-[16px] font-semibold text-ink-strong">
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-warn" aria-hidden="true">
              <path d="M3.5 14V2.5M3.5 2.5h8l-1.8 3 1.8 3h-8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Flagged for review
          </span>
          <span className="font-ui text-[14px] tabular-nums text-ink/65">
            {flaggedCount} question{flaggedCount === 1 ? "" : "s"}
          </span>
        </Link>
      )}

      <nav aria-label="Question format" className="mb-6 flex flex-wrap items-center gap-1.5">
        {(
          [
            { value: "all", label: `Both (${perFormat.all})` },
            { value: "sba", label: `SBA (${perFormat.sba})` },
            { value: "emq", label: `EMQ (${perFormat.emq})` },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "all" ? "/practise" : `/practise?format=${tab.value}`}
            aria-current={format === tab.value ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-control border px-3 font-ui text-[14px] font-medium transition-colors duration-fast ${
              format === tab.value
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-ink/75 hover:text-ink-strong"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {practisable.length === 0 ? (
        <EmptyState title={format === "all" ? "No topics yet" : `No ${format.toUpperCase()} questions yet`}>
          {format === "all"
            ? "Questions for this paper are still being written and approved. They appear here as soon as they are ready."
            : "Try the other format, or both together."}
        </EmptyState>
      ) : (
        grouped.map(([parent, topics]) => (
        <ScrollFade key={parent} className="mb-8">
          <h2 className="mb-2 font-display text-[21px] font-semibold text-ink-strong">
            {parent}
          </h2>
          {/* One column, not two.

              Side by side, two topics of different name lengths left a
              gap between them and the eye had to choose which way to
              read: across to the neighbour or down to the next topic.
              A syllabus is a list, and a list reads down. */}
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {topics.map((s) => {
            const n = counts.get(s.id) ?? 0;
            const covered = done.get(s.id) ?? 0;
            const inner = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-ui text-[16px] font-semibold text-ink-strong">
                    {s.title}
                  </span>
                  <span className="shrink-0 font-ui text-[14px] tabular-nums text-ink/65">
                    {n} question{n === 1 ? "" : "s"}
                  </span>
                </div>
                <CoverageBar done={covered} total={n} />
              </>
            );
            return (
              <li key={s.id}>
                <Link
                  href={`/practise/${s.id}${format === "all" ? "" : `?format=${format}`}`}
                  className="block px-4 py-3.5 transition-colors duration-fast hover:bg-sunk focus-visible:bg-sunk"
                >
                  {inner}
                </Link>
              </li>
            );
          })}
          </ul>
        </ScrollFade>
        ))
      )}
    </>
  );
}
