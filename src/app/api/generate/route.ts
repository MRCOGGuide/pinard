import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runGenerationBatch } from "@/lib/generate-batch";
import type { QuestionFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The Generation console's endpoint: one batch, run while the admin
 * watches. The batch itself lives in lib/generate-batch.ts, so the
 * queue worker runs exactly the same code unattended.
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
    sectionId?: number;
    format?: QuestionFormat;
    count?: number;
    documentId?: number;
  } | null;

  const result = await runGenerationBatch({
    sectionId: Number(body?.sectionId),
    documentId: Number(body?.documentId) || null,
    format: body?.format === "emq" ? "emq" : "sba",
    count: Number(body?.count) || 0,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
