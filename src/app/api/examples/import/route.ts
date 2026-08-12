import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseText } from "@/lib/chunking";
import {
  PARSE_PROMPT,
  buildExampleRows,
  parseModelReply,
} from "@/lib/exampleImport";

export const runtime = "nodejs";
export const maxDuration = 300;

// A single pass has to read the whole document AND emit JSON for every
// question inside one function invocation. Past roughly this much text
// that outruns the platform's time limit, so refuse early and point at
// the multi-part book importer instead of failing after five minutes.
const MAX_CHARS = 60_000;

/**
 * Import example questions from a single PDF (e.g. a TOG CPD set):
 * extract the text, have the model parse every SBA and EMQ set into
 * structured JSON, validate, and store as style exemplars. Where the
 * document carries no answer key, the model's best answer is used and
 * flagged in the rationale for admin verification — examples teach the
 * generator style only; facts always come from ingested sources.
 */
export async function POST(request: Request) {
  // Admin only.
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const rawSectionId = Number(form?.get("sectionId"));
  const sourceNote = String(form?.get("sourceNote") ?? "").trim();
  if (!(file instanceof File) || !Number.isFinite(rawSectionId) || rawSectionId < 0) {
    return NextResponse.json(
      { error: "A file and a section are required" },
      { status: 400 }
    );
  }
  // 0 = "all sections": stored as a null section_id.
  const sectionId = rawSectionId === 0 ? null : rawSectionId;

  // 1. Extract the text.
  let text: string;
  try {
    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
    } else {
      text = await file.text();
    }
  } catch {
    return NextResponse.json(
      { error: "Could not read the file — is it a valid PDF?" },
      { status: 400 }
    );
  }
  text = sanitiseText(text);
  if (!text.trim()) {
    return NextResponse.json(
      { error: "No text could be extracted (scanned/image-only PDFs are not supported)" },
      { status: 400 }
    );
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      {
        error: `This document is too long for the single-document importer (about ${Math.round(text.length / 3_000)} pages of text). Use “Import a question book (large PDF)” instead — it processes the file in parts, with no size limit.`,
      },
      { status: 400 }
    );
  }

  // 2. Parse with the model, streaming progress bytes to the client so
  // the platform never times the connection out mid-parse. The final
  // line of the response body is the result JSON.
  const encoder = new TextEncoder();
  const docText = text;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const result = await runImport(docText, sectionId, sourceNote, () =>
          send(".")
        );
        send("\n" + JSON.stringify(result));
      } catch (error) {
        send(
          "\n" +
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            })
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function runImport(
  text: string,
  sectionId: number | null,
  sourceNote: string,
  onProgress: () => void
) {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  let raw: string;
  let stopReason: string | null = null;
  try {
    const messageStream = client.messages.stream({
      model,
      max_tokens: 32_000,
      system: PARSE_PROMPT,
      messages: [{ role: "user", content: `DOCUMENT:\n${text}` }],
    });
    messageStream.on("text", onProgress);
    const response = await messageStream.finalMessage();
    const block = response.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
    stopReason = response.stop_reason;
  } catch (error) {
    return {
      error: `API error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const parsed = parseModelReply(raw, stopReason);
  if ("error" in parsed) return parsed;

  const { sbaRows, emqRows, emqGroupCount, skipped, unsourced } =
    buildExampleRows(parsed.data, sectionId, sourceNote, undefined, text);

  if (sbaRows.length === 0 && emqRows.length === 0) {
    return {
      error: `No usable questions found in the document${unsourced > 0 ? ` — ${unsourced} had no answer stated in the document, and answers are never guessed` : ""}${skipped.length ? ` (${skipped.length} skipped)` : ""}`,
      skipped: skipped.slice(0, 10),
    };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("example_questions")
    .insert([...sbaRows, ...emqRows]);
  if (error) {
    return { error: error.message };
  }

  return {
    ok: true,
    sba: sbaRows.length,
    emqGroups: emqGroupCount,
    emqScenarios: emqRows.length,
    unsourced,
    skipped: skipped.slice(0, 10),
  };
}
