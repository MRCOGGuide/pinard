import "server-only";
import { readSetting, writeSetting } from "@/lib/settings";

/**
 * Library documents replaced by a newer edition (owner, 20 November 2026:
 * "remove all the questions with the old one and use the new guideline
 * instead"; and, the day before, "dont delete anything from library
 * until launch").
 *
 * A replaced document stays in the library, so nothing is deleted and
 * questions that cited it still name their source, but it is no longer
 * used: Ask Pinard's search leaves it out and the question writer does
 * not draw on it. Kept in app_settings (no schema change), set from
 * Admin > Guidelines.
 */

export const REPLACED_KEY = "replaced_documents";

export type Replacement = {
  /** The library document that replaces it, if it is in the library. */
  by: number | null;
  at: string;
  note?: string;
};

export type ReplacedMap = Record<string, Replacement>;

let cached: { at: number; map: ReplacedMap } | null = null;
const TTL_MS = 60_000;

export async function readReplaced(fresh = false): Promise<ReplacedMap> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.map;
  const raw = await readSetting(REPLACED_KEY);
  let map: ReplacedMap = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object") map = parsed as ReplacedMap;
  } catch {
    map = {};
  }
  cached = { at: Date.now(), map };
  return map;
}

/** The ids of replaced documents, for leaving them out of search and writing. */
export async function replacedDocumentIds(): Promise<Set<number>> {
  return new Set(Object.keys(await readReplaced()).map(Number));
}

export async function markReplaced(oldId: number, by: number | null, note?: string): Promise<{ error?: string }> {
  if (!Number.isInteger(oldId) || oldId <= 0) return { error: "No document named" };
  if (by !== null && by === oldId) return { error: "A document cannot replace itself" };
  const map = { ...(await readReplaced(true)) };
  map[String(oldId)] = { by, at: new Date().toISOString(), ...(note ? { note } : {}) };
  const result = await writeSetting(REPLACED_KEY, JSON.stringify(map));
  cached = null;
  return result;
}

export async function unmarkReplaced(oldId: number): Promise<{ error?: string }> {
  const map = { ...(await readReplaced(true)) };
  delete map[String(oldId)];
  const result = await writeSetting(REPLACED_KEY, JSON.stringify(map));
  cached = null;
  return result;
}
