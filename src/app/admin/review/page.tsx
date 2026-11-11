import { fetchAll } from "@/lib/supabase/all";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { formatReference } from "@/lib/reference";
import type {
  QuestionFormat,
  QuestionOption,
} from "@/lib/types";
import type { GeneratedExplanation } from "@/lib/generation";
import { ReviewQueue } from "./ReviewQueue";
import { FailureList } from "./FailureList";

export type PendingQuestion = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  explanation: string | null;
  explanations: GeneratedExplanation[];
  explanation_table: unknown;
  figure: unknown;
  difficulty: number | null;
  citation_chunk_ids: number[];
  lead_in: string | null;
  emq_group_id: string | null;
  status: string;
  created_at: string;
  sections: { title: string } | null;
};

export type PassageMap = Record<
  number,
  { text: string; source_reference: string; document_title: string }
>;

export type FailureRow = {
  id: number;
  reason: string;
  format: QuestionFormat | null;
  created_at: string;
  sections: { title: string } | null;
};

export default async function ReviewPage() {
  const supabase = await createClient();

  const [{ data: questions }, { data: failures }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("generated_questions")
        .select("*, sections(title)")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
    ).then((data) => ({ data })),
    // Every unresolved row, not the most recent fifty. The screen
    // groups identical faults now, and a cap would make a group of 390
    // report itself as 50 and clear only 50 when resolved. The table
    // holds a few hundred rows, so reading all of them is cheaper than
    // being wrong about how often something has failed.
    fetchAll((from, to) =>
      supabase
        .from("generation_failures")
        .select("id, reason, format, created_at, sections(title)")
        .eq("resolved", false)
        // A candidate's challenge to a question has its own screen,
        // Reports, beside the questions candidates report directly.
        .not("reason", "like", "chat challenge on question %")
        .order("created_at", { ascending: false })
        .range(from, to)
    ).then((data) => ({ data })),
  ]);

  const pending = (questions ?? []) as PendingQuestion[];

  /*
    The approved scenarios of every set with one waiting here. A
    scenario sent back to Review on its own (#1895, its two siblings
    already approved) showed as a lone "orphan scenario", an SBA with a
    long option list, and the owner's rule is that no EMQ stands alone
    (8 November 2026). It is shown inside its set instead, the approved
    ones read-only, so it is judged as a candidate will meet it.
  */
  const groupIds = Array.from(
    new Set(
      pending
        .filter((q) => q.format === "emq" && q.emq_group_id)
        .map((q) => q.emq_group_id as string)
    )
  );
  const approvedSiblings: PendingQuestion[] = [];
  for (let i = 0; i < groupIds.length; i += 100) {
    const { data } = await supabase
      .from("generated_questions")
      .select("*, sections(title)")
      .eq("status", "approved")
      .in("emq_group_id", groupIds.slice(i, i + 100))
      .order("id", { ascending: true });
    approvedSiblings.push(...((data ?? []) as PendingQuestion[]));
  }

  // Fetch every cited passage once, for instant click-through.
  const citedIds = Array.from(
    new Set(
      [...pending, ...approvedSiblings].flatMap((q) => q.citation_chunk_ids ?? [])
    )
  );
  const passages: PassageMap = {};
  if (citedIds.length > 0) {
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select(
        "id, text, content_documents(title, source_reference, source_year, tog_year, tog_issue)"
      )
      .in("id", citedIds);
    for (const c of (chunks ?? []) as unknown as {
      id: number;
      text: string;
      content_documents: {
        title: string;
        source_reference: string;
        source_year: number | null;
        tog_year: number | null;
        tog_issue: number | null;
      } | null;
    }[]) {
      const doc = c.content_documents;
      passages[c.id] = {
        text: c.text,
        document_title: doc?.title ?? "",
        // Dated, so a reviewer can see at a glance whether the passage
        // behind a claim is current guidance or a superseded edition.
        source_reference: formatReference({
          reference: doc?.source_reference ?? "",
          year: doc?.source_year ?? null,
          togYear: doc?.tog_year ?? null,
          togIssue: doc?.tog_issue ?? null,
        }),
      };
    }
  }

  return (
    <>
      <TraceHeader
        title="Review queue"
        eyebrow={`${pending.length} pending`}
        lede="Approve, edit or reject each question. Keyboard: A approve · E edit · R reject. The guideline in brackets is what candidates see; click a chunk to read the passage behind it (admin only)."
      />

      <ReviewQueue
        questions={pending}
        approvedSiblings={approvedSiblings}
        passages={passages}
      />

      <FailureList failures={(failures ?? []) as unknown as FailureRow[]} />
    </>
  );
}
