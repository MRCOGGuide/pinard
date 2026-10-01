/**
 * The figure a question is read from, or taught with.
 *
 * One column, several kinds. "placement" decides when the candidate
 * sees it: a trace the question is asked FROM belongs in the stem,
 * before they answer; a trace that teaches belongs under the
 * explanation, after.
 *
 * Pure functions — no I/O.
 */
import { type Cystometrogram, parseCystometrogram } from "./cystometrogram";

export type Figure = {
  placement: "stem" | "explanation";
  kind: "cystometrogram";
  trace: Cystometrogram;
};

/** A figure worth drawing, or null. */
export function parseFigure(value: unknown): Figure | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== "cystometrogram") return null;
  const trace = parseCystometrogram(raw);
  if (!trace) return null;
  return {
    placement: raw.placement === "explanation" ? "explanation" : "stem",
    kind: "cystometrogram",
    trace,
  };
}

/** The figure to show beside the question, or null. */
export function figureFor(
  value: unknown,
  placement: "stem" | "explanation"
): Figure | null {
  const figure = parseFigure(value);
  return figure && figure.placement === placement ? figure : null;
}
