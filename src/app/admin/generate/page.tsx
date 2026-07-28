import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { Section } from "@/lib/types";
import { GenerationConsole } from "./GenerationConsole";

export type GenerationDoc = {
  id: number;
  title: string;
  section_id: number;
};

export default async function GeneratePage() {
  const supabase = createClient();

  const [{ data: sections }, { data: documents }, { count: pendingCount }] =
    await Promise.all([
      supabase.from("sections").select("*").order("sort_order"),
      supabase
        .from("content_documents")
        .select("id, title, section_id")
        .eq("status", "ingested")
        .order("title"),
      supabase
        .from("generated_questions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  const allSections = (sections ?? []) as Section[];

  // Parent lookup so a parent section's document list includes its
  // subsections' documents.
  const sectionParents: Record<number, number | null> = {};
  for (const s of allSections) sectionParents[s.id] = s.parent_id;

  return (
    <>
      <TraceHeader
        title="Generation console"
        lede="Pick a section and format, choose how many, and generate. Focus on a single document to target one guideline, or leave it on the whole section for a balanced mix. Every question is verified against its sources, then waits in the review queue for your approval."
      />

      <GenerationConsole
        options={sectionOptions(allSections)}
        docs={(documents ?? []) as GenerationDoc[]}
        sectionParents={sectionParents}
        pendingCount={pendingCount ?? 0}
      />
    </>
  );
}
