import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { QuestionFormat, QuestionOption, Section } from "@/lib/types";
import type { GeneratedExplanation } from "@/lib/generation";
import { BankBrowser } from "./BankBrowser";

export type BankQuestion = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  explanation: string | null;
  explanations: GeneratedExplanation[];
  difficulty: number | null;
  source_document_ids: number[] | null;
  created_at: string;
  reviewed_at: string | null;
  lead_in: string | null;
  emq_group_id: string | null;
  sections: { title: string } | null;
};

export type BankDocument = {
  id: number;
  title: string;
  source_reference: string;
};

export default async function BankPage() {
  const supabase = createClient();

  const [{ data: sections }, { data: documents }, { data: questions }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase
        .from("content_documents")
        .select("id, title, source_reference")
        .order("title"),
      supabase
        .from("generated_questions")
        .select(
          "id, section_id, format, stem, options, correct_key, explanation, explanations, difficulty, source_document_ids, created_at, reviewed_at, lead_in, emq_group_id, sections(title)"
        )
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false }),
    ]);

  const allSections = (sections ?? []) as Section[];
  const sectionParents: Record<number, number | null> = {};
  for (const s of allSections) sectionParents[s.id] = s.parent_id;

  return (
    <>
      <TraceHeader
        title="Question bank"
        lede="Every approved question, filed by section and source guideline. When a guideline is updated: filter by that guideline, select all, delete, then regenerate from the new version."
      />

      <BankBrowser
        questions={(questions ?? []) as unknown as BankQuestion[]}
        docs={(documents ?? []) as BankDocument[]}
        options={sectionOptions(allSections)}
        sectionParents={sectionParents}
      />
    </>
  );
}
