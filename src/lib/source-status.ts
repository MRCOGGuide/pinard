/**
 * How far a source has got, at a glance (owner, 6 November 2026): "To easily
 * recognise which sources needs work in terms of questions/decision
 * aids/ingestion/chunks/facts".
 *
 * Counts of questions include those waiting in Review, as the owner's rule
 * is about what has been generated. An EMQ set counts once, as on the card.
 */
export type Tone = "red" | "yellow" | "green" | "neutral";

/** Enough questions to call a format done, unless the source has no more to give. */
const ENOUGH = 4;

export const questionTone = (generated: number): Tone => (generated === 0 ? "red" : generated < ENOUGH ? "yellow" : "green");

/** None found is not work left to do, so it is not red. */
export const aidTone = (aids: number, searched: boolean, pdf: boolean): Tone => (aids > 0 ? "green" : searched || !pdf ? "neutral" : "red");

export type SourceProgress = {
  state: "complete" | "partial" | "none";
  missing: string[];
};

export function sourceProgress(s: {
  chunks: number;
  facts: number;
  /** A clean pass over the source found these facts, even if that is none. */
  factsChecked: boolean;
  sba: number;
  emq: number;
  sbaMax: boolean;
  emqMax: boolean;
  aids: number;
  searched: boolean;
  pdf: boolean;
}): SourceProgress {
  const missing = [
    ...(s.chunks > 0 && (s.facts > 0 || s.factsChecked) ? [] : ["ingestion"]),
    ...(s.sba >= ENOUGH || s.sbaMax ? [] : ["SBAs"]),
    ...(s.emq >= ENOUGH || s.emqMax ? [] : ["EMQ sets"]),
    ...(s.aids > 0 || s.searched || !s.pdf ? [] : ["decision aids"]),
  ];
  if (missing.length === 0) return { state: "complete", missing };
  /* Every source in the library is ingested, so ingestion cannot be what
     tells nothing done from partly done: it is whether anything has been
     made from the source, or tried. */
  const nothingTried = s.sba + s.emq === 0 && !s.sbaMax && !s.emqMax && s.aids === 0 && !s.searched;
  return { state: s.chunks === 0 || nothingTried ? "none" : "partial", missing };
}
