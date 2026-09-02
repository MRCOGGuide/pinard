import { TraceHeader } from "@/components/TraceHeader";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationJob } from "@/lib/queue";
import { EXAM_LABELS, type Section } from "@/lib/types";
import { QueueManager } from "./QueueManager";

export const dynamic = "force-dynamic";

export type JobRow = GenerationJob & { section_label: string };

export default async function QueuePage() {
  await requireAdmin();
  const supabase = createAdminClient();

  const [{ data: jobRows }, { data: sectionRows }] = await Promise.all([
    supabase
      .from("generation_jobs")
      .select("*")
      .order("status", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("sections").select("*").order("sort_order"),
  ]);

  const sections = (sectionRows ?? []) as Section[];
  const byId = new Map(sections.map((s) => [s.id, s]));
  const label = (id: number): string => {
    const section = byId.get(id);
    if (!section) return `Section ${id}`;
    const parent = section.parent_id ? byId.get(section.parent_id) : null;
    const exam = EXAM_LABELS[(parent ?? section).exam];
    return parent
      ? `${exam} · ${parent.title} › ${section.title}`
      : `${exam} · ${section.title}`;
  };

  const jobs: JobRow[] = ((jobRows ?? []) as GenerationJob[]).map((job) => ({
    ...job,
    section_label: label(job.section_id),
  }));

  return (
    <>
      <TraceHeader
        title="Generation queue"
        lede="Set a question target per sub-topic and let it fill the gaps. Progress is stored, so a run survives a closed tab — press Run to work through the queue now, or leave it to the daily cron."
      />
      <QueueManager jobs={jobs} />
    </>
  );
}
