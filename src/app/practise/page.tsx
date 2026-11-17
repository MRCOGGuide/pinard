import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { leafSections } from "@/lib/performance";
import { fetchFlaggedIds, fetchSeenIds } from "@/lib/session";
import { fetchAll } from "@/lib/supabase/all";
import { PractiseTopics, type Kind, type PractiseGroup } from "./PractiseTopics";
import {
  EXAM_LABELS,
  type ExamPart,
  type QuestionFormat,
  type Section,
} from "@/lib/types";
import { redirectToSignIn } from "@/lib/auth";
import { getAccess, hasFullAccess } from "@/lib/access";

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
  /*
    Asked together. These were asked one after another, eight round trips
    in a row, and every format tab asked them all again (owner, 17
    November 2026: "switching between both/SBA/EMQ is slow"). Only the
    syllabus waits for the exam; the tabs now switch in the browser
    (PractiseTopics), so this runs once a visit.
  */
  const [access, { data: profile }] = await Promise.all([
    getAccess(supabase, user.id),
    supabase.from("profiles").select("exam").eq("id", user.id).single(),
  ]);
  const full = hasFullAccess(access);
  if (!profile?.exam) redirect("/onboarding");

  const [{ data: sections }, flagged, approved, seen] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam).order("sort_order"),
    fetchFlaggedIds(supabase, user.id),
    /*
      Paged, because PostgREST stops at 1000 rows and says nothing about
      it. The bank passed that a while ago, so every count on this screen
      was quietly wrong — the "Both" tab read exactly 1000 against a bank
      of 1362, and the per-topic counts were short by whatever fell off
      the end. Ordered by id: paged with no order, a page boundary could
      repeat a row or drop one.
    */
    fetchAll<{ id: number; section_id: number; format: QuestionFormat }>((from, to) =>
      supabase
        .from("generated_questions")
        .select("id, section_id, format")
        .eq("status", "approved")
        .order("id")
        .range(from, to)
    ),
    fetchSeenIds(supabase, user.id),
  ]);
  const flaggedCount = flagged.length;

  const all = (sections ?? []) as Section[];
  const units = leafSections(all);
  // A topic's parent — Obstetrics, Gynaecology, TOG — so the list reads
  // as the syllabus does rather than as 35 headings in a row.
  const titleById = new Map(all.map((s) => [s.id, s.title]));

  const format: Kind =
    searchParams.format === "sba" || searchParams.format === "emq"
      ? searchParams.format
      : "all";

  /*
    Approved questions per topic, of each kind, and how many of each the
    candidate has answered, which is what the coverage bar reports; and
    the totals for the tabs, so a format that would show nothing says so
    before it is chosen. Every kind at once, for this exam's topics.
  */
  const unitIds = new Set(units.map((s) => s.id));
  const zero = (): Record<Kind, number> => ({ all: 0, sba: 0, emq: 0 });
  const held = new Map<number, Record<Kind, number>>();
  const seenIn = new Map<number, Record<Kind, number>>();
  const totals = zero();
  for (const row of approved) {
    if (!unitIds.has(row.section_id)) continue;
    const h = held.get(row.section_id) ?? zero();
    h.all += 1;
    h[row.format] += 1;
    held.set(row.section_id, h);
    totals.all += 1;
    totals[row.format] += 1;
    if (seen.has(row.id)) {
      const s = seenIn.get(row.section_id) ?? zero();
      s.all += 1;
      s[row.format] += 1;
      seenIn.set(row.section_id, s);
    }
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
  const practisable = units.filter((s) => (held.get(s.id)?.all ?? 0) > 0);

  /*
    Grouped under the heading each topic sits below — Obstetrics,
    Gynaecology, the TOG sections — in syllabus order. Thirty-five
    topics in one flat grid is a list to be searched; under their own
    headings it is the syllabus, which is how a candidate already
    thinks about what to revise.
  */
  const groups: PractiseGroup[] = [];
  for (const topic of practisable) {
    // A top-level topic is its own heading — TOG Articles hangs off
    // nothing and is the largest topic in the bank, so "Other" was both
    // unhelpful and where a candidate would look last.
    const parent = topic.parent_id ? titleById.get(topic.parent_id) : null;
    const heading = parent ?? topic.title;
    const item = { id: topic.id, title: topic.title, held: held.get(topic.id) ?? zero(), seen: seenIn.get(topic.id) ?? zero() };
    const existing = groups.find((g) => g.heading === heading);
    if (existing) existing.topics.push(item);
    else groups.push({ heading, topics: [item] });
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

      <PractiseTopics groups={groups} totals={totals} initial={format} />
    </>
  );
}
