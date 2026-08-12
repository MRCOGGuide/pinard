import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseText } from "@/lib/chunking";
import {
  BOOK_PART_NOTE,
  PARSE_PROMPT,
  buildExampleRows,
  normaliseStem,
  parseModelReply,
} from "@/lib/exampleImport";

export const runtime = "nodejs";
export const maxDuration = 300;

// Pages are grouped into windows of roughly this many characters; each
// request processes ONE window, and the browser loops through them so
// no single invocation outlives the platform limit.
//
// The window must be large enough to hold a block of questions AND the
// answer key that follows it, because an answer is only accepted when
// it is stated in the same text — questions whose key falls outside
// the window are dropped rather than guessed. Generous overlap gives
// a straddling block a second chance to appear whole; the stem-level
// dedupe absorbs anything extracted twice.
const WINDOW_CHARS = 70_000;
const OVERLAP_PAGES = 4;

/**
 * Import a large question book (hundreds of pages) part by part. The
 * file is uploaded to storage by the browser first (no request-size
 * cap), then each call processes one window of pages.
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

  const body = (await request.json().catch(() => null)) as {
    path?: string;
    sectionId?: number;
    sourceNote?: string;
    cursor?: number;
  } | null;
  const path = String(body?.path ?? "");
  const rawSectionId = Number(body?.sectionId);
  const sourceNote = String(body?.sourceNote ?? "").trim();
  const cursor = Math.max(0, Number(body?.cursor) || 0);
  if (
    !path.startsWith("examples/") ||
    !Number.isFinite(rawSectionId) ||
    rawSectionId < 0
  ) {
    return NextResponse.json(
      { error: "A stored file path and a section are required" },
      { status: 400 }
    );
  }
  // 0 = "all sections": stored as a null section_id.
  const sectionId = rawSectionId === 0 ? null : rawSectionId;

  const supabase = createAdminClient();

  // 1. Download and split into page windows (deterministic per file).
  const { data: file, error: downloadError } = await supabase.storage
    .from("sources")
    .download(path);
  if (downloadError || !file) {
    return NextResponse.json(
      { error: `Could not download the stored file: ${downloadError?.message}` },
      { status: 400 }
    );
  }

  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const extracted = await extractText(pdf, { mergePages: false });
    pages = (extracted.text as string[]).map((p) => sanitiseText(p));
  } catch {
    return NextResponse.json(
      { error: "Could not read the file — is it a valid PDF?" },
      { status: 400 }
    );
  }

  const windows: string[] = [];
  let current = "";
  let recent: string[] = []; // trailing pages, for overlap
  for (const page of pages) {
    if (current.length + page.length > WINDOW_CHARS && current.trim()) {
      windows.push(current);
      current = recent.join("");
    }
    const block = page + "\n\n";
    current += block;
    recent.push(block);
    if (recent.length > OVERLAP_PAGES) recent = recent.slice(-OVERLAP_PAGES);
  }
  if (current.trim()) windows.push(current);

  if (windows.length === 0) {
    return NextResponse.json(
      { error: "No text could be extracted (scanned/image-only PDFs are not supported)" },
      { status: 400 }
    );
  }
  if (cursor >= windows.length) {
    return NextResponse.json({ ok: true, nextCursor: null, totalParts: windows.length, sba: 0, emqGroups: 0, emqScenarios: 0, skipped: [] });
  }

  // Existing stems in this scope, so overlap and re-runs don't create
  // duplicates.
  const existingQuery = supabase.from("example_questions").select("stem");
  const { data: existing } = await (sectionId === null
    ? existingQuery.is("section_id", null)
    : existingQuery.eq("section_id", sectionId));
  const existingStems = new Set(
    (existing ?? []).map((r) => normaliseStem(r.stem as string))
  );

  // 2. Parse this window, streaming progress; final line is the result.
  const windowText = windows[cursor];
  const totalParts = windows.length;
  const nextCursor = cursor + 1 < windows.length ? cursor + 1 : null;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => controller.enqueue(encoder.encode(s));
      try {
        const result = await runPart(
          windowText,
          sectionId,
          sourceNote,
          existingStems,
          () => send(".")
        );
        send("\n" + JSON.stringify({ ...result, nextCursor, totalParts }));
      } catch (error) {
        send(
          "\n" +
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              nextCursor: cursor, // retry this part
              totalParts,
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

async function runPart(
  text: string,
  sectionId: number | null,
  sourceNote: string,
  existingStems: Set<string>,
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
      system: PARSE_PROMPT + BOOK_PART_NOTE,
      messages: [{ role: "user", content: `DOCUMENT (one part of the book):\n${text}` }],
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
    buildExampleRows(
      parsed.data,
      sectionId,
      sourceNote,
      existingStems,
      text
    );

  // A part with no questions (contents page, prose chapter) is fine.
  if (sbaRows.length + emqRows.length > 0) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("example_questions")
      .insert([...sbaRows, ...emqRows]);
    if (error) return { error: error.message };
  }

  return {
    ok: true,
    sba: sbaRows.length,
    emqGroups: emqGroupCount,
    emqScenarios: emqRows.length,
    unsourced,
    skipped: skipped.slice(0, 5),
  };
}
