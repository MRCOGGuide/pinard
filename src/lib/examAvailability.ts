import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamPart } from "@/lib/types";

export type ExamAvailability = Record<ExamPart, boolean>;

/** Which exam parts are live for candidates. Missing rows count as off. */
export async function getExamAvailability(
  supabase: SupabaseClient
): Promise<ExamAvailability> {
  const { data } = await supabase
    .from("exam_availability")
    .select("exam, is_live");
  const map: ExamAvailability = { part1: false, part2: false, part3: false };
  for (const row of (data ?? []) as { exam: ExamPart; is_live: boolean }[]) {
    map[row.exam] = row.is_live;
  }
  return map;
}
