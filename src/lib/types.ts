export type ExamPart = "part1" | "part2" | "part3";
export type QuestionFormat = "sba" | "emq";

export const EXAM_LABELS: Record<ExamPart, string> = {
  part1: "Part 1",
  part2: "Part 2",
  part3: "Part 3",
};

export type Section = {
  id: number;
  exam: ExamPart;
  title: string;
  parent_id: number | null;
  sort_order: number;
  is_active: boolean;
};

export type ContentDocument = {
  id: number;
  section_id: number;
  title: string;
  source_reference: string;
  source_year: number | null;
  file_url: string | null;
  status: "uploaded" | "processing" | "ingested" | "failed";
  uploaded_at: string;
  // When key-fact extraction last completed cleanly (null = never has;
  // a doc with chunks and no facts is only "partial" while null).
  facts_extracted_at: string | null;
  // TOG issue identity (all set together, or all null for non-TOG).
  tog_year: number | null;
  tog_issue: number | null;
  tog_category: string | null;
};

export type QuestionOption = { key: string; text: string };

export type ExampleQuestion = {
  id: number;
  section_id: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correct_key: string;
  rationale: string | null;
  source_note: string | null;
  /** EMQ only: the shared instruction paragraph for the set. */
  lead_in: string | null;
  /** EMQ only: rows in the same set share this id. */
  emq_group_id: string | null;
};

/** Option keys A, B, C … for question options. */
export const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRST".split("");
