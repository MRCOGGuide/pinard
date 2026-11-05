import "server-only";
import { stripCitations } from "@/lib/chat";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The gaps log (owner's brief, part 7). An answer that cannot cover
 * something says so in words, so the gaps are read from those words: no
 * extra model call, and what is logged is exactly what the reader was told.
 * Admin > Ask gaps shows them, because a gap is either something to add to
 * the library or a passage the search should have found.
 */

/** Most an answer can add to the log, if a closing line runs on. */
const MOST_FROM_ONE_ANSWER = 8;
const LONGEST_GAP = 300;

function tidied(text: string): string {
  return text.replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:.]+$/g, "").slice(0, LONGEST_GAP);
}

/** What the answer says is not covered, one item each. A refusal leaves only the question to say what was missing. */
export function gapsIn(reply: string, question: string): string[] {
  const gaps: string[] = [];
  for (const raw of stripCitations(reply).split("\n")) {
    const line = raw.replace(/^\s*[-•]\s*/, "").trim();
    if (!/\bnot covered\b/i.test(line)) continue;
    const listed = line.match(/^not covered[^:]*:\s*(.+)$/i);
    if (listed) {
      gaps.push(...listed[1].split(/;\s*/));
      continue;
    }
    const subject = line.match(/^(.*?)\s+(?:is|are)\s+not covered\b/i)?.[1]?.trim();
    if (!subject || /^(this|that|it|these|those)$/i.test(subject)) gaps.push(question);
    else gaps.push(subject);
  }
  return [...new Set(gaps.map(tidied).filter(Boolean))].slice(0, MOST_FROM_ONE_ANSWER);
}

export type GapStatus = "open" | "added" | "not_a_gap";
export type GapRow = { id: number; created_at: string; gap: string; status: GapStatus };
export type GroupedGap = { gap: string; ids: number[]; times: number; last: string; open: boolean; status: GapStatus };

/** The same gap in different capitals or punctuation is one gap. */
const keyOf = (gap: string) => gap.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** From rows newest first, so each gap keeps its latest wording and verdict. Most often first. */
export function groupedGaps(rows: GapRow[]): GroupedGap[] {
  const groups = new Map<string, GroupedGap>();
  for (const row of rows) {
    const key = keyOf(row.gap);
    const found = groups.get(key);
    if (found) {
      found.ids.push(row.id);
      found.times += 1;
      found.open ||= row.status === "open";
    } else {
      groups.set(key, { gap: row.gap, ids: [row.id], times: 1, last: row.created_at, open: row.status === "open", status: row.status });
    }
  }
  return [...groups.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last));
}

/** Never costs an answer: until phase53 is run the table is not there, and this does nothing. */
export async function logAskGaps(reply: string, question: string, origin: "ask" | "bench" | "follow_up"): Promise<void> {
  const gaps = gapsIn(reply, question);
  if (!gaps.length) return;
  try {
    await createAdminClient().from("ask_gaps").insert(gaps.map((gap) => ({ gap, origin })));
  } catch (error) {
    console.error("The gaps log could not be written:", error);
  }
}
