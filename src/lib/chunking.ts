import { Tiktoken } from "js-tiktoken/lite";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

/**
 * Chunker for the ingestion pipeline: 600–800 tokens per chunk with
 * ~15% overlap between consecutive chunks (PROJECT.md section 7).
 */

// Chunks fill greedily to MAX_TOKENS, so typical chunks land in the
// 600–800 band; only a document's final chunk can be shorter.
const MAX_TOKENS = 800;
const OVERLAP_RATIO = 0.15;

let encoder: Tiktoken | null = null;
function getEncoder() {
  if (!encoder) encoder = new Tiktoken(cl100k_base);
  return encoder;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

export type Chunk = { index: number; text: string; tokenCount: number };

type Sentence = { text: string; tokens: number };

/** Split text into sentence-ish units, hard-splitting anything too long. */
function toSentences(text: string): Sentence[] {
  const enc = getEncoder();
  const rough = text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences: Sentence[] = [];
  for (const piece of rough) {
    const tokens = enc.encode(piece);
    if (tokens.length <= MAX_TOKENS) {
      sentences.push({ text: piece, tokens: tokens.length });
      continue;
    }
    // A single run longer than a whole chunk (e.g. a table) — hard-split.
    for (let start = 0; start < tokens.length; start += MAX_TOKENS) {
      const slice = tokens.slice(start, start + MAX_TOKENS);
      sentences.push({ text: enc.decode(slice), tokens: slice.length });
    }
  }
  return sentences;
}

export function chunkText(raw: string): Chunk[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!text) return [];

  const sentences = toSentences(text);
  const chunks: Chunk[] = [];
  let current: Sentence[] = [];
  let currentTokens = 0;

  const finalize = () => {
    if (current.length === 0) return;
    const body = current.map((s) => s.text).join(" ");
    chunks.push({
      index: chunks.length,
      text: body,
      tokenCount: currentTokens,
    });

    // Seed the next chunk with ~15% of this one's tokens as overlap.
    const overlapTarget = Math.floor(currentTokens * OVERLAP_RATIO);
    const overlap: Sentence[] = [];
    let overlapTokens = 0;
    for (let i = current.length - 1; i >= 0 && overlapTokens < overlapTarget; i--) {
      overlap.unshift(current[i]);
      overlapTokens += current[i].tokens;
    }
    current = overlap;
    currentTokens = overlapTokens;
  };

  for (const sentence of sentences) {
    if (current.length > 0 && currentTokens + sentence.tokens > MAX_TOKENS) {
      finalize();
    }
    current.push(sentence);
    currentTokens += sentence.tokens;
  }

  // Tail: only counts if it adds something beyond pure overlap.
  if (current.length > 0) {
    const body = current.map((s) => s.text).join(" ");
    const last = chunks[chunks.length - 1];
    if (!last || !last.text.endsWith(body)) {
      chunks.push({ index: chunks.length, text: body, tokenCount: currentTokens });
    }
  }

  return chunks;
}
