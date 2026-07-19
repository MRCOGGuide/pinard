import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type { Section } from "@/lib/types";
import { GenerationConsole } from "./GenerationConsole";

export default async function GeneratePage() {
  const supabase = createClient();

  const [{ data: sections }, { count: pendingCount }] = await Promise.all([
    supabase.from("sections").select("*").order("sort_order"),
    supabase
      .from("generated_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return (
    <>
      <TraceHeader
        title="Generation console"
        lede="Pick a section and format, choose how many, and generate. Every question is verified against its sources, then waits in the review queue for your approval."
      />

      <GenerationConsole
        options={sectionOptions((sections ?? []) as Section[])}
        pendingCount={pendingCount ?? 0}
      />
    </>
  );
}
