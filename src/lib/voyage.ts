/**
 * Voyage AI embeddings client (server only).
 * Model default: voyage-3.5 — 1024 dimensions, matching the
 * vector(1024) columns in the schema. Override with VOYAGE_MODEL.
 */

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const BATCH_SIZE = 64;

export async function embedTexts(
  texts: string[],
  inputType: "document" | "query"
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is missing — add it to .env.local");
  }
  const model = process.env.VOYAGE_MODEL ?? "voyage-3.5";

  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);

    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: batch,
        model,
        input_type: inputType,
        output_dimension: 1024,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Voyage embeddings failed (${response.status}): ${detail.slice(0, 300)}`
      );
    }

    const payload = (await response.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    // Voyage returns items with their index within the batch; keep order.
    const ordered = [...payload.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) embeddings.push(item.embedding);
  }

  return embeddings;
}
