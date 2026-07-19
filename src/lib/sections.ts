import { EXAM_LABELS, type Section } from "@/lib/types";

export type SectionOption = { id: number; label: string };

/**
 * Flattens the section tree into ordered <select> options:
 * "Part 2 · Maternal medicine" and "Part 2 · Maternal medicine › Sepsis".
 */
export function sectionOptions(sections: Section[]): SectionOption[] {
  const byOrder = (a: Section, b: Section) => a.sort_order - b.sort_order;
  const parents = sections
    .filter((s) => s.parent_id === null)
    .sort((a, b) => a.exam.localeCompare(b.exam) || byOrder(a, b));

  const out: SectionOption[] = [];
  for (const parent of parents) {
    out.push({
      id: parent.id,
      label: `${EXAM_LABELS[parent.exam]} · ${parent.title}`,
    });
    for (const child of sections
      .filter((s) => s.parent_id === parent.id)
      .sort(byOrder)) {
      out.push({
        id: child.id,
        label: `${EXAM_LABELS[parent.exam]} · ${parent.title} › ${child.title}`,
      });
    }
  }
  return out;
}
