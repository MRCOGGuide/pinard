import { fetchAll } from "@/lib/supabase/all";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { QuestionFormat, QuestionOption, Section } from "@/lib/types";
import type { GeneratedExplanation } from "@/lib/generation";
import { BankBrowser } from "./BankBrowser";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BankQuestion = {
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
  source_document_ids: number[] | null;
  created_at: string;
  reviewed_at: string | null;
  showcase: boolean;
  /** Absent until phase38-free-sample.sql has been run. */
  free_sample?: boolean;
  lead_in: string | null;
  emq_group_id: string | null;
  sections: { title: string } | null;
};

export type BankDocument = {
  id: number;
  title: string;
  source_reference: string;
  source_year: number | null;
  tog_year: number | null;
  tog_issue: number | null;
};

/*
  free_sample arrives with phase38-free-sample.sql, and naming a column
  that does not exist fails the whole read — which would take the Bank
  down rather than hide one button. So the column list is tried with
  it and again without, and a row that comes back without the field
  simply reads as not on the sample.
*/
const COLUMNS =
  "id, section_id, format, stem, options, correct_key, explanation, explanations, explanation_table, figure, difficulty, source_document_ids, created_at, reviewed_at, showcase, lead_in, emq_group_id, sections(title)";

async function loadQuestions(supabase: SupabaseClient) {
  /* A column list held in a variable loses the client's own typing, so
     the shape fetchAll needs is stated here instead. */
  type Page = PromiseLike<{
    data: BankQuestion[] | null;
    error: { message: string } | null;
  }>;
  const read = (columns: string) =>
    fetchAll<BankQuestion>(
      (from, to) =>
        supabase
          .from("generated_questions")
          .select(columns)
          .eq("status", "approved")
          .order("reviewed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to) as unknown as Page
    );
  try {
    return await read(`${COLUMNS}, free_sample`);
  } catch {
    return await read(COLUMNS);
  }
}

export default async function BankPage() {
  const supabase = createClient();

  const [{ data: sections }, { data: documents }, { data: questions }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase
        .from("content_documents")
        .select("id, title, source_reference, source_year, tog_year, tog_issue")
        .order("title"),
      loadQuestions(supabase).then((data) => ({ data })),
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
