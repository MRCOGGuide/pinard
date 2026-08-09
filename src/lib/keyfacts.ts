import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_K } from "@/lib/prompts";

/**
 * Key-fact extraction (prompt K) — run per chunk during ingestion.
 * Powers the "Similar Values" panel via the key_facts table.
 */

export type ExtractedFact = {
  subject: string;
  fact_type: string;
  value_numeric: number | null;
  value_text: string | null;
  statement: string;
};

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseFacts(raw: string): ExtractedFact[] {
  // The prompt forbids fences, but strip them defensively.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as { facts?: unknown };
  if (!Array.isArray(parsed.facts)) return [];

  const facts: ExtractedFact[] = [];
  for (const entry of parsed.facts) {
    if (typeof entry !== "object" || entry === null) continue;
    const f = entry as Record<string, unknown>;
    if (typeof f.subject !== "string" || typeof f.statement !== "string") {
      continue;
    }
    facts.push({
      subject: f.subject,
      fact_type: typeof f.fact_type === "string" ? f.fact_type : "value",
      value_numeric:
        typeof f.value_numeric === "number" && Number.isFinite(f.value_numeric)
          ? f.value_numeric
          : null,
      value_text: typeof f.value_text === "string" ? f.value_text : null,
      statement: f.statement,
    });
  }
  return facts;
}

/**
 * Extract quantifiable facts from one chunk. Returns [] (and logs)
 * on parse failure rather than failing the whole ingestion.
 */
export async function extractKeyFacts(
  chunkText: string
): Promise<ExtractedFact[]> {
  // Bulk ingestion fires one call per chunk and can brush the account's
  // per-minute rate limits; retry hard (the SDK backs off and honours
  // retry-after) instead of silently losing that chunk's facts.
  const client = new Anthropic({ maxRetries: 6 });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `${PROMPT_K}\n\nPASSAGE:\n${chunkText}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return [];

  try {
    return parseFacts(text.text);
  } catch (error) {
    console.error("Key-fact JSON parse failed:", error);
    return [];
  }
}
