/**
 * The table under an explanation.
 *
 * Some guidance is a table, and prose is the wrong shape for it. The
 * risks of surgical abortion are three figures that only mean anything
 * against each other — cervical injury 1 in 100, uterine perforation
 * 1-4 in 1000, uterine rupture under 1 in 1000 — and the commonest way
 * to get the question wrong is to reach for a neighbouring row. Bile
 * acids in ICP are the same shape: four bands, each with its own
 * stillbirth risk and its own timing.
 *
 * A candidate meeting those as a sentence has to rebuild the table in
 * their head before they can compare anything. So where the passages
 * carry a stratification, the question carries it too, structured.
 *
 * Structured rather than written into the prose, for three reasons: it
 * renders the same everywhere without a markdown parser, the row the
 * question turns on can be marked, and it can be checked — every cell
 * has to appear in the passages, which prose cannot promise.
 *
 * Pure functions — no I/O.
 */

export type ExplanationTable = {
  /** What the table is of: "Risks of surgical abortion". */
  caption: string;
  /** Two to four headers. More than four does not fit a phone. */
  columns: string[];
  /** Each row as many cells as there are columns. */
  rows: string[][];
  /**
   * The rows this question turns on, so the answer is seen in context.
   *
   * More than one, because a question often turns on more than one row:
   * a woman with a BMI of 36 and type 2 diabetes carries two minor risk
   * factors, and marking only the first says her diabetes was not part
   * of the answer. Stored as a single number by earlier versions, which
   * still parses.
   */
  highlight?: number[];
};

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const MAX_CELL = 120;

/**
 * A table worth showing, or null.
 *
 * A single row is a sentence, and anything past eight is a reference
 * work rather than a revision aid: both are refused rather than
 * rendered badly.
 */
export function parseExplanationTable(value: unknown): ExplanationTable | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const caption = typeof raw.caption === "string" ? raw.caption.trim() : "";
  const columns = Array.isArray(raw.columns)
    ? raw.columns.filter((c): c is string => typeof c === "string").map((c) => c.trim())
    : [];
  const rows = Array.isArray(raw.rows)
    ? raw.rows
        .filter((r): r is unknown[] => Array.isArray(r))
        .map((r) =>
          r.map((cell) => (typeof cell === "string" ? cell.trim() : String(cell ?? "")))
        )
    : [];

  if (!caption) return null;
  if (columns.length < MIN_COLUMNS || columns.length > MAX_COLUMNS) return null;
  if (rows.length < MIN_ROWS || rows.length > MAX_ROWS) return null;
  // A ragged table cannot be rendered honestly: a short row would leave
  // a cell blank where the guidance said something.
  if (rows.some((r) => r.length !== columns.length)) return null;
  if (rows.some((r) => r.some((c) => c.length > MAX_CELL))) return null;
  if (rows.some((r) => r.every((c) => c === ""))) return null;

  // Accepts a bare number as well as a list: 44 tables were written
  // before a question could turn on more than one row.
  const wanted = Array.isArray(raw.highlight)
    ? raw.highlight
    : raw.highlight === undefined
      ? []
      : [raw.highlight];
  const highlight = Array.from(
    new Set(
      wanted.filter(
        (h): h is number =>
          typeof h === "number" &&
          Number.isInteger(h) &&
          h >= 0 &&
          h < rows.length
      )
    )
  ).sort((a, b) => a - b);

  return {
    caption,
    columns,
    rows,
    highlight: highlight.length > 0 ? highlight : undefined,
  };
}

/**
 * Cells that do not appear in the passages.
 *
 * The same rule as everything else here: a table is a set of factual
 * claims, and an invented row is worse than no table. Compared with
 * punctuation and spacing flattened, because a passage extracted from a
 * PDF spaces "1–4 in 1000" unpredictably; a cell that is only a header
 * word or a dash is not a claim and is not checked.
 */
export function ungroundedCells(
  table: ExplanationTable,
  passages: string[]
): string[] {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const haystack = flat(passages.join("   "));
  const haystackWords = new Set(haystack.split(" "));

  const bad: string[] = [];
  for (const row of table.rows) {
    for (const cell of row) {
      const needle = flat(cell);
      if (needle.length < 3) continue;

      // Whole cell present: nothing more to ask.
      if (haystack.includes(needle)) continue;

      const words = needle.split(" ").filter(Boolean);

      // Every figure must be there. A number is the part of a cell that
      // can be invented without looking invented, and it is the part a
      // candidate carries into the exam.
      const figures = words.filter((w) => /[0-9]/.test(w));
      if (figures.some((f) => !haystackWords.has(f))) {
        bad.push(cell);
        continue;
      }

      // The wording need not match. A passage extracted from a PDF
      // reads "less than 1 in 1000 for second- trimester medical
      // abortions", and a cell reading "Less than 1 in 1000
      // (second-trimester)" is that same fact rather than a new one, so
      // most of the words must be present rather than all of them in
      // order.
      const meaningful = words.filter((w) => w.length > 2);
      if (meaningful.length === 0) continue;
      const shared = meaningful.filter((w) => haystackWords.has(w)).length;
      if (shared / meaningful.length < 0.7) bad.push(cell);
    }
  }
  return Array.from(new Set(bad));
}
