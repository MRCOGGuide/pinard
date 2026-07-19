import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { sectionOptions } from "@/lib/sections";
import type {
  ExampleQuestion,
  QuestionOption,
  Section,
} from "@/lib/types";
import { ExamplesManager } from "./ExamplesManager";

export type ExampleWithSection = ExampleQuestion & {
  sections: { title: string } | null;
};

export type EmqScenario = {
  id: number;
  stem: string;
  correct_key: string;
  rationale: string | null;
};

export type EmqGroup = {
  groupId: string;
  sectionId: number;
  sectionTitle: string | null;
  leadIn: string;
  options: QuestionOption[];
  sourceNote: string | null;
  scenarios: EmqScenario[];
};

export type ExampleItem =
  | { kind: "sba"; example: ExampleWithSection }
  | { kind: "emq"; group: EmqGroup };

export default async function ExamplesPage({
  searchParams,
}: {
  searchParams: { section?: string };
}) {
  const sectionId = Number(searchParams.section) || null;

  const supabase = createClient();

  let query = supabase
    .from("example_questions")
    .select("*, sections(title)")
    .order("id", { ascending: false });
  if (sectionId) query = query.eq("section_id", sectionId);

  const [{ data: sections }, { data: examples }] = await Promise.all([
    supabase.from("sections").select("*").order("sort_order"),
    query,
  ]);

  // Collapse EMQ rows into their sets, keeping newest-first order.
  const rows = (examples ?? []) as ExampleWithSection[];
  const seenGroups = new Set<string>();
  const items: ExampleItem[] = [];
  for (const row of rows) {
    if (row.format === "emq" && row.emq_group_id) {
      if (seenGroups.has(row.emq_group_id)) continue;
      seenGroups.add(row.emq_group_id);
      const members = rows
        .filter((r) => r.emq_group_id === row.emq_group_id)
        .sort((a, b) => a.id - b.id);
      items.push({
        kind: "emq",
        group: {
          groupId: row.emq_group_id,
          sectionId: row.section_id,
          sectionTitle: row.sections?.title ?? null,
          leadIn: row.lead_in ?? "",
          options: members[0].options,
          sourceNote: members[0].source_note,
          scenarios: members.map((m) => ({
            id: m.id,
            stem: m.stem,
            correct_key: m.correct_key,
            rationale: m.rationale,
          })),
        },
      });
    } else {
      items.push({ kind: "sba", example: row });
    }
  }

  return (
    <>
      <TraceHeader
        title="Example questions"
        lede="Style templates the generator learns from — SBAs and EMQ sets. These are never shown to users."
      />

      <ExamplesManager
        options={sectionOptions((sections ?? []) as Section[])}
        sectionId={sectionId}
        items={items}
      />
    </>
  );
}
