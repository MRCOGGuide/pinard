/**
 * TOG (The Obstetrician & Gynaecologist) issue metadata. The journal
 * publishes 4 issues a year — January, April, July, October — each
 * with articles, CPD questions, letters & replies, and an
 * MBRRACE/UKOSS update.
 */

export const TOG_CATEGORIES = [
  { value: "article", label: "Articles" },
  { value: "cpd", label: "CPD questions" },
  { value: "letters", label: "Letters & replies" },
  { value: "update", label: "MBRRACE / UKOSS update" },
] as const;

export type TogCategory = (typeof TOG_CATEGORIES)[number]["value"];

export const TOG_ISSUE_MONTHS: Record<number, string> = {
  1: "January",
  2: "April",
  3: "July",
  4: "October",
};

export function togCategoryLabel(value: string | null): string {
  return TOG_CATEGORIES.find((c) => c.value === value)?.label ?? "";
}

export function togIssueLabel(issue: number): string {
  const month = TOG_ISSUE_MONTHS[issue];
  return month ? `Issue ${issue} (${month})` : `Issue ${issue}`;
}
