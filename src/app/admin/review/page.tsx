import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
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
  explanations: GeneratedExplanation[];
  difficulty: number | null;
  citation_chunk_ids: number[];
  lead_in: string | null;
  emq_group_id: string | null;
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
  const supabase = createClient();

  const [{ data: questions }, { data: failures }] = await Promise.all([
    supabase
      .from("generated_questions")
      .select("*, sections(title)")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("generation_failures")
      .select("id, reason, format, created_at, sections(title)")
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const pending = (questions ?? []) as PendingQuestion[];

  // Fetch every cited passage once, for instant click-through.
  const citedIds = Array.from(
    new Set(pending.flatMap((q) => q.citation_chunk_ids ?? []))
  );
  const passages: PassageMap = {};
  if (citedIds.length > 0) {
    const { data: chunks } = await supabase
      .from("content_chunks")
      .select("id, text, content_documents(title, source_reference)")
      .in("id", citedIds);
    for (const c of (chunks ?? []) as unknown as {
      id: number;
      text: string;
      content_documents: { title: string; source_reference: string } | null;
    }[]) {
      passages[c.id] = {
        text: c.text,
        document_title: c.content_documents?.title ?? "",
        source_reference: c.content_documents?.source_reference ?? "",
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

      <ReviewQueue questions={pending} passages={passages} />

      <FailureList failures={(failures ?? []) as unknown as FailureRow[]} />
    </>
  );
}
