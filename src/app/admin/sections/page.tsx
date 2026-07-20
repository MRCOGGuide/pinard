import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { getExamAvailability } from "@/lib/examAvailability";
import { EXAM_LABELS, type ExamPart, type Section } from "@/lib/types";
import { SectionsManager } from "./SectionsManager";
import { ExamVisibility } from "./ExamVisibility";

export default async function SectionsPage({
  searchParams,
}: {
  searchParams: { exam?: string };
}) {
  const exam: ExamPart = (
    ["part1", "part2", "part3"] as const
  ).includes(searchParams.exam as ExamPart)
    ? (searchParams.exam as ExamPart)
    : "part1";

  const supabase = createClient();
  const [{ data }, availability] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", exam).order("sort_order"),
    getExamAvailability(supabase),
  ]);
  const sections = (data ?? []) as Section[];

  const parents = sections.filter((s) => s.parent_id === null);
  const tree = parents.map((parent) => ({
    ...parent,
    children: sections.filter((s) => s.parent_id === parent.id),
  }));

  return (
    <>
      <TraceHeader
        title="Sections"
        lede="The syllabus tree per exam. Sub-topics sit inside sections; only active items are visible to users."
      />

      <ExamVisibility availability={availability} />

      <div className="mb-5 mt-6 flex gap-2">
        {(Object.keys(EXAM_LABELS) as ExamPart[]).map((part) => (
          <Link
            key={part}
            href={`/admin/sections?exam=${part}`}
            className={`rounded-card border px-3 py-1.5 text-sm font-medium ${
              part === exam
                ? "border-theatre bg-theatre text-porcelain"
                : "border-hairline bg-porcelain text-graphite/70 hover:text-theatre"
            }`}
          >
            {EXAM_LABELS[part]}
            {!availability[part] && (
              <span className="ml-1.5 font-mono text-[10px] opacity-60">
                hidden
              </span>
            )}
          </Link>
        ))}
      </div>

      <SectionsManager exam={exam} tree={tree} />
    </>
  );
}
