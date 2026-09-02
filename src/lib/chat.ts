/**
 * Follow-up tutor chat — the pure half (PROJECT.md item 7, prompt C).
 *
 * Limits, citation handling and the shapes both sides share. Nothing
 * here touches Anthropic, Supabase or the network, so the client
 * components can import it; the model call lives in chat-service.ts.
 */

/** Longest question a candidate may send in one turn. */
export const CHAT_MESSAGE_LIMIT = 600;

/**
 * Messages replayed to the model each turn. The question, its answer
 * and fresh passages are re-sent every time, so the history only has
 * to carry the thread of the conversation — six exchanges is plenty
 * for "why not B?" followed by "and in a twin pregnancy?".
 */
export const CHAT_HISTORY_TURNS = 12;

/**
 * Messages stored per candidate per question. A follow-up chat is a
 * few questions about one card, not an open-ended tutor; the cap keeps
 * a stuck conversation from running up cost against one question.
 */
export const CHAT_TURN_LIMIT = 24;

export type ChatRole = "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

/** A passage the reply cited, named the way the question card names it. */
export type ChatSource = {
  chunk_id: number;
  title: string;
  reference: string;
};

/** One message as the panel shows it: prose, plus what it cited. */
export type ChatTurn = {
  role: ChatRole;
  /** Raw content as stored, still carrying its [chunk:N] markers. */
  content: string;
  sources: ChatSource[];
};

/** Passage citation markers, as prompt G requires them: [chunk:12]. */
const CITATION = /\[chunk:\s*(\d+)\]/gi;

/** Every passage id cited in a reply, de-duplicated, in order of use. */
export function citedChunkIds(text: string): number[] {
  const ids: number[] = [];
  // Fresh regex per call: CITATION is global, so a shared lastIndex
  // would make the second call on the same text start mid-string.
  const re = new RegExp(CITATION.source, "gi");
  let match = re.exec(text);
  while (match) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
    match = re.exec(text);
  }
  return ids;
}

/**
 * One line per document, not per passage. An answer routinely cites
 * three passages of the same guideline, and listing the chunks gives
 * three identical lines under it; what a candidate needs to know is
 * which guidance it came from.
 */
export function dedupeSources(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  const out: ChatSource[] = [];
  for (const source of sources) {
    const key = `${source.title}|${source.reference}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

/**
 * Markers out, prose in. The rest of the app keeps chunk ids out of
 * anything a candidate reads and prints the source underneath instead
 * — the reply is shown the same way, with its passages listed below.
 *
 * Emphasis markers go too. Replies are asked for in plain text and the
 * cards render them as plain text, so a stray **72–75%** would reach a
 * candidate with its asterisks showing.
 */
export function stripCitations(text: string): string {
  return text
    .replace(CITATION, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
