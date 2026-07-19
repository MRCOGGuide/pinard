import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunks, type RetrievedChunk } from "@/lib/retrieval";
import {
  generateVerifiedQuestion,
  type StyleExample,
} from "@/lib/generation";
import { EXAM_LABELS, type ExamPart, type QuestionFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const POOL_SIZE = 24; // chunks retrieved for the section
const PER_QUESTION = 10; // chunks sampled per question, for variety
const DIFFICULTIES = [2, 3, 4]; // cycled across the batch

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
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

  const body = (await request.json().catch(() => null)) as {
    sectionId?: number;
    format?: QuestionFormat;
    count?: number;
  } | null;
  const sectionId = Number(body?.sectionId);
  const format: QuestionFormat = body?.format === "emq" ? "emq" : "sba";
  const count = Math.min(Math.max(Number(body?.count) || 0, 1), 20);
  if (!sectionId) {
    return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: section } = await supabase
    .from("sections")
    .select("id, title, exam")
    .eq("id", sectionId)
    .single();
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  const examLabel = EXAM_LABELS[section.exam as ExamPart];

  // 1. Retrieve a pool of passages for the section (query = its title).
  let pool: RetrievedChunk[];
  try {
    pool = await retrieveChunks(section.title, [sectionId], POOL_SIZE);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Retrieval failed" },
      { status: 500 }
    );
  }
  if (pool.length === 0) {
    return NextResponse.json(
      {
        error:
          "No source passages for this section. Ingest a document for it first.",
      },
      { status: 400 }
    );
  }

  // 2. Style examples of the chosen format (this section first, else any).
  const { data: sectionExamples } = await supabase
    .from("example_questions")
    .select("format, stem, options, correct_key, lead_in, rationale")
    .eq("format", format)
    .eq("section_id", sectionId)
    .limit(4);
  let examples = (sectionExamples ?? []) as StyleExample[];
  if (examples.length < 3) {
    const { data: anyExamples } = await supabase
      .from("example_questions")
      .select("format, stem, options, correct_key, lead_in, rationale")
      .eq("format", format)
      .limit(4);
    if ((anyExamples?.length ?? 0) > examples.length) {
      examples = (anyExamples ?? []) as StyleExample[];
    }
  }

  // 3–5. Generate, verify, store.
  let created = 0;
  let flagged = 0;
  let insufficient = 0;
  const problems: string[] = [];

  for (let i = 0; i < count; i++) {
    const passages = sample(pool, PER_QUESTION);
    const difficulty = DIFFICULTIES[i % DIFFICULTIES.length];

    const outcome = await generateVerifiedQuestion({
      examPart: examLabel,
      sectionTitle: section.title,
      format,
      difficulty,
      passages,
      examples,
    });

    if (outcome.status === "ok") {
      const q = outcome.question;
      const { error } = await supabase.from("generated_questions").insert({
        section_id: sectionId,
        format,
        stem: q.stem,
        options: q.options,
        correct_key: q.correct_key,
        explanations: q.explanations,
        difficulty: Math.min(Math.max(q.difficulty, 1), 5),
        citation_chunk_ids: q.citation_chunk_ids,
        status: "pending",
      });
      if (error) {
        flagged++;
        problems.push(`store failed: ${error.message}`);
        await supabase.from("generation_failures").insert({
          section_id: sectionId,
          format,
          reason: `store failed: ${error.message}`,
          raw_response: JSON.stringify(q).slice(0, 4000),
        });
      } else {
        created++;
      }
    } else if (outcome.status === "insufficient") {
      insufficient++;
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: "model reported insufficient_source_material",
        raw_response: null,
      });
    } else {
      flagged++;
      problems.push(outcome.reason);
      await supabase.from("generation_failures").insert({
        section_id: sectionId,
        format,
        reason: outcome.reason,
        raw_response: outcome.raw.slice(0, 4000),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    flagged,
    insufficient,
    problems: problems.slice(0, 5),
  });
}
