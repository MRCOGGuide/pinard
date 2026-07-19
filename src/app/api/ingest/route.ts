import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chunkText } from "@/lib/chunking";
import { embedTexts } from "@/lib/voyage";
import { anthropicConfigured, extractKeyFacts } from "@/lib/keyfacts";

export const runtime = "nodejs";
export const maxDuration = 300;

const FACT_CONCURRENCY = 3;

/**
 * Ingestion pipeline (PROJECT.md section 7, Source library):
 * extract text → chunk (600–800 tokens, 15% overlap) → embed via
 * Voyage → store chunks → prompt K per chunk → store key facts.
 */
export async function POST(request: Request) {
  // Only an admin may trigger ingestion.
  const authClient = createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await authClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    documentId?: number;
  } | null;
  const documentId = Number(body?.documentId);
  if (!documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: doc } = await supabase
    .from("content_documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  if (!doc.file_url) {
    return NextResponse.json({ error: "Document has no stored file" }, { status: 400 });
  }

  await supabase
    .from("content_documents")
    .update({ status: "processing" })
    .eq("id", documentId);

  try {
    // 1. Download and extract text.
    const { data: file, error: downloadError } = await supabase.storage
      .from("sources")
      .download(doc.file_url);
    if (downloadError || !file) {
      throw new Error(`Could not download stored file: ${downloadError?.message}`);
    }

    let text: string;
    if (doc.file_url.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
    } else {
      text = await file.text();
    }

    if (!text.trim()) {
      throw new Error(
        "No text could be extracted (scanned/image-only PDFs are not supported yet)"
      );
    }

    // 2. Chunk.
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("Chunking produced no chunks");

    // 3. Embed with Voyage.
    const embeddings = await embedTexts(
      chunks.map((c) => c.text),
      "document"
    );

    // 4. Replace any previous chunks (cascade deletes their key facts).
    await supabase.from("content_chunks").delete().eq("document_id", documentId);

    const { data: insertedChunks, error: insertError } = await supabase
      .from("content_chunks")
      .insert(
        chunks.map((chunk, i) => ({
          document_id: documentId,
          section_id: doc.section_id,
          chunk_index: chunk.index,
          text: chunk.text,
          embedding: embeddings[i],
          token_count: chunk.tokenCount,
        }))
      )
      .select("id, chunk_index, text");
    if (insertError || !insertedChunks) {
      throw new Error(`Storing chunks failed: ${insertError?.message}`);
    }

    // 5. Key facts via prompt K (skipped if the Anthropic key is absent).
    let factCount = 0;
    let factsSkipped = false;
    if (anthropicConfigured()) {
      const queue = [...insertedChunks];
      const workers = Array.from(
        { length: Math.min(FACT_CONCURRENCY, queue.length) },
        async () => {
          for (;;) {
            const chunk = queue.shift();
            if (!chunk) return;
            try {
              const facts = await extractKeyFacts(chunk.text);
              if (facts.length === 0) continue;
              const { error } = await supabase.from("key_facts").insert(
                facts.map((fact) => ({
                  chunk_id: chunk.id,
                  section_id: doc.section_id,
                  subject: fact.subject,
                  fact_type: fact.fact_type,
                  value_numeric: fact.value_numeric,
                  value_text: fact.value_text,
                  statement: fact.statement,
                  source_reference: doc.source_reference,
                }))
              );
              if (!error) factCount += facts.length;
              else console.error("key_facts insert failed:", error.message);
            } catch (error) {
              console.error(
                `Fact extraction failed for chunk ${chunk.chunk_index}:`,
                error
              );
            }
          }
        }
      );
      await Promise.all(workers);
    } else {
      factsSkipped = true;
    }

    await supabase
      .from("content_documents")
      .update({ status: "ingested" })
      .eq("id", documentId);

    return NextResponse.json({
      ok: true,
      chunks: insertedChunks.length,
      facts: factCount,
      factsSkipped,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Ingestion failed for document ${documentId}:`, message);
    await supabase
      .from("content_documents")
      .update({ status: "failed" })
      .eq("id", documentId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
