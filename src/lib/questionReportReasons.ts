/**
 * Why a candidate reports a question. Shared by the report form and the
 * server, with no database in it, so the form can import it.
 *
 * The list is the faults the bank has actually had: a wrong answer, an
 * explanation that is wrong or unclear, a citation that does not say
 * what is claimed, guidance that has moved on, and wording.
 */
export const REPORT_REASONS = [
  { key: "answer", label: "The marked answer is wrong" },
  { key: "second", label: "Another option is also correct" },
  { key: "explanation", label: "The explanation is wrong or unclear" },
  { key: "citation", label: "The cited guidance does not support it" },
  { key: "outdated", label: "Based on outdated guidance" },
  { key: "wording", label: "Typo, wording or formatting" },
  { key: "other", label: "Something else" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["key"];

export const REPORT_NOTE_LIMIT = 1000;

export function reasonLabel(key: string): string {
  return REPORT_REASONS.find((r) => r.key === key)?.label ?? key;
}
