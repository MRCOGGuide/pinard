import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitiseText } from "@/lib/chunking";
import type { QuestionOption } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CHARS = 200_000;

/**
 * Import example questions from a PDF (e.g. a TOG CPD set): extract
 * the text, have the model parse every SBA and EMQ set into structured
 * JSON, validate, and store as style exemplars. Where the document
 * carries no answer key, the model's best answer is used and flagged
 * in the rationale for admin verification — examples teach the
 * generator style only; facts always come from ingested sources.
 */

const PARSE_PROMPT = `You convert exam-question documents into structured JSON. The document contains single-best-answer (SBA) questions and/or extended-matching question (EMQ) sets, e.g. a TOG CPD set.

Rules:
- Extract EVERY question in the document. Preserve wording verbatim (UK English); do not paraphrase or fix the questions.
- SBA: a stem with its own lettered options.
- EMQ set: one shared lettered option list + a lead-in instruction + several numbered scenario vignettes answered from that list.
- If the document indicates correct answers (an answer key, marked answers, or true/false statements), use them and set "inferred": false.
- If not, choose the single best answer yourself and set "inferred": true.
- Option keys are capital letters in order: A, B, C, ...
- Ignore non-question content (prose, references, adverts, instructions).

Respond ONLY with JSON, no markdown fences:
{
  "sba": [
    { "stem": "...", "options": [{"key": "A", "text": "..."}, ...],
      "correct_key": "A", "inferred": false, "rationale": "one short sentence or empty string" }
  ],
  "emq_groups": [
    { "lead_in": "...", "options": [{"key": "A", "text": "..."}, ...],
      "scenarios": [
        { "stem": "...", "correct_key": "C", "inferred": true, "rationale": "" }
      ] }
  ]
}
If the document contains no questions at all, respond with {"sba": [], "emq_groups": []}.`;

type ParsedOption = { key?: unknown; text?: unknown };
type ParsedSba = {
  stem?: unknown;
  options?: ParsedOption[];
  correct_key?: unknown;
  inferred?: unknown;
  rationale?: unknown;
};
type ParsedEmqGroup = {
  lead_in?: unknown;
  options?: ParsedOption[];
  scenarios?: ParsedSba[];
};

function cleanOptions(raw: ParsedOption[] | undefined): QuestionOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) =>
    typeof o?.key === "string" && typeof o?.text === "string" && o.text.trim()
      ? [{ key: o.key.trim().toUpperCase(), text: o.text.trim() }]
      : []
  );
}

function noteRationale(item: ParsedSba): string | null {
  const base = typeof item.rationale === "string" ? item.rationale.trim() : "";
  if (item.inferred === true) {
    return `[AI-inferred answer — verify] ${base}`.trim();
  }
  return base || null;
}

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
  const sectionId = Number(form?.get("sectionId"));
  const sourceNote = String(form?.get("sourceNote") ?? "").trim();
  if (!(file instanceof File) || !sectionId) {
    return NextResponse.json(
      { error: "A file and a section are required" },
      { status: 400 }
    );
  }

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
  text = sanitiseText(text).slice(0, MAX_CHARS);
  if (!text.trim()) {
    return NextResponse.json(
      { error: "No text could be extracted (scanned/image-only PDFs are not supported)" },
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
  sectionId: number,
  sourceNote: string,
  onProgress: () => void
) {
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  let raw: string;
  try {
    const messageStream = client.messages.stream({
      model,
      max_tokens: 16_000,
      system: PARSE_PROMPT,
      messages: [{ role: "user", content: `DOCUMENT:\n${text}` }],
    });
    messageStream.on("text", onProgress);
    const response = await messageStream.finalMessage();
    const block = response.content.find((b) => b.type === "text");
    raw = block && block.type === "text" ? block.text : "";
  } catch (error) {
    return {
      error: `API error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let data: { sba?: ParsedSba[]; emq_groups?: ParsedEmqGroup[] };
  try {
    data = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    );
  } catch {
    return {
      error:
        "The model's response could not be parsed — the set may be too long for one pass; try splitting the PDF",
    };
  }

  // 3. Validate and build rows; skip anything malformed with a note.
  const skipped: string[] = [];
  const sbaRows: Record<string, unknown>[] = [];
  const sbaItems = data.sba ?? [];
  for (let i = 0; i < sbaItems.length; i++) {
    const item = sbaItems[i];
    const stem = typeof item.stem === "string" ? item.stem.trim() : "";
    const options = cleanOptions(item.options);
    const correctKey =
      typeof item.correct_key === "string" ? item.correct_key.trim().toUpperCase() : "";
    if (!stem || options.length < 2) {
      skipped.push(`SBA ${i + 1}: missing stem or options`);
      continue;
    }
    if (!options.some((o) => o.key === correctKey)) {
      skipped.push(`SBA ${i + 1}: no valid correct answer`);
      continue;
    }
    sbaRows.push({
      section_id: sectionId,
      format: "sba",
      stem,
      options,
      correct_key: correctKey,
      rationale: noteRationale(item),
      source_note: sourceNote || null,
    });
  }

  const emqRows: Record<string, unknown>[] = [];
  let emqGroupCount = 0;
  const emqGroups = data.emq_groups ?? [];
  for (let g = 0; g < emqGroups.length; g++) {
    const group = emqGroups[g];
    const leadIn = typeof group.lead_in === "string" ? group.lead_in.trim() : "";
    const options = cleanOptions(group.options);
    const scenarios = Array.isArray(group.scenarios) ? group.scenarios : [];
    if (!leadIn || options.length < 4 || scenarios.length === 0) {
      skipped.push(`EMQ set ${g + 1}: incomplete lead-in, options or scenarios`);
      continue;
    }
    const groupId = crypto.randomUUID();
    let added = 0;
    for (let s = 0; s < scenarios.length; s++) {
      const scenario = scenarios[s];
      const stem = typeof scenario.stem === "string" ? scenario.stem.trim() : "";
      const correctKey =
        typeof scenario.correct_key === "string"
          ? scenario.correct_key.trim().toUpperCase()
          : "";
      if (!stem || !options.some((o) => o.key === correctKey)) {
        skipped.push(`EMQ set ${g + 1}, scenario ${s + 1}: missing stem or valid answer`);
        continue;
      }
      emqRows.push({
        section_id: sectionId,
        format: "emq",
        stem,
        options,
        correct_key: correctKey,
        rationale: noteRationale(scenario),
        source_note: sourceNote || null,
        lead_in: leadIn,
        emq_group_id: groupId,
      });
      added++;
    }
    if (added > 0) emqGroupCount++;
  }

  if (sbaRows.length === 0 && emqRows.length === 0) {
    return {
      error: `No usable questions found in the document${skipped.length ? ` (${skipped.length} skipped)` : ""}`,
      skipped: skipped.slice(0, 10),
    };
  }

  // 4. Store.
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
    skipped: skipped.slice(0, 10),
  };
}
