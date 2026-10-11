/**
 * The pathway library (owner's brief, 11 October 2026, part 2).
 *
 * An experienced obstetrician does not work out the management of a
 * risk factor from the guideline every time: they recognise it and
 * follow the pathway they know. Ask Pinard did the opposite, rebuilding
 * management from raw passages on every question, and named risks it
 * then left unmanaged. So each pathway is drawn out of the sources once,
 * in advance, read by the owner, and only an approved one drives a live
 * answer.
 *
 * Every item carries the chunk ids it came from and is checked against
 * them before the owner ever sees it: the ids must be passages the
 * extraction was given, and every figure must be written in one of them.
 * Nothing is filled from general knowledge; a gap is recorded as a gap,
 * and two sources that disagree are both kept for the owner to choose.
 *
 * Pure: no I/O, so the build script and the admin page share it.
 */

import { figureGroundingProblems, ukEnglishCorrected } from "@/lib/generation";
import {
  emptyBody,
  PATHWAY_FIELDS,
  type PathwayBody,
  type PathwayConflict,
  type PathwayItem,
} from "@/lib/pathway-shape";

export * from "@/lib/pathway-shape";

function asItems(raw: unknown): PathwayItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PathwayItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const text = typeof o.text === "string" ? ukEnglishCorrected(o.text.trim()) : "";
    if (!text) continue;
    const chunks = Array.isArray(o.chunks)
      ? o.chunks.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    const item: PathwayItem = { text, chunks };
    if (typeof o.when === "string" && o.when.trim()) item.when = o.when.trim();
    if (typeof o.where === "string" && o.where.trim()) item.where = o.where.trim();
    out.push(item);
  }
  return out;
}

/** A body as the model sent it, made safe to store and render. */
export function normaliseBody(raw: unknown): PathwayBody {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const body = emptyBody();
  for (const { key } of PATHWAY_FIELDS) body[key] = asItems(o[key]);
  return body;
}

export function normaliseConflicts(raw: unknown): PathwayConflict[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        topic: typeof o.topic === "string" ? o.topic.trim() : "",
        positions: asItems(o.positions).map(({ text, chunks }) => ({ text, chunks })),
      };
    })
    .filter((c) => c.topic && c.positions.length >= 2);
}

/**
 * The deterministic checks, item by item. An item that cites nothing,
 * cites a passage it was not given, or states a figure none of its cited
 * passages contains is removed, with the reason kept for the owner.
 */
export function checkItems(
  body: PathwayBody,
  passageText: Map<number, string>
): { body: PathwayBody; removed: string[] } {
  const removed: string[] = [];
  const out = emptyBody();
  for (const { key, label } of PATHWAY_FIELDS) {
    for (const item of body[key]) {
      const unknown = item.chunks.filter((id) => !passageText.has(id));
      if (item.chunks.length === 0) {
        removed.push(`${label}: "${item.text}": cites no passage`);
        continue;
      }
      if (unknown.length > 0) {
        removed.push(`${label}: "${item.text}": cites passages it was not given (${unknown.join(", ")})`);
        continue;
      }
      const sources = item.chunks.map((id) => passageText.get(id) ?? "");
      const figures = figureGroundingProblems([item.when ?? "", item.text].join(" "), sources);
      if (figures.length > 0) {
        removed.push(`${label}: "${item.text}": ${figures.join("; ").replace(/the explanation states/g, "states")}`);
        continue;
      }
      out[key].push(item);
    }
  }
  return { body: out, removed };
}
