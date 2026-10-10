"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { answerFromLibrary, type AskTrace } from "@/lib/chat-service";
import { CHAT_MESSAGE_LIMIT } from "@/lib/chat";
import { getPlan } from "@/lib/plan";
import { beginAsk } from "@/lib/askAllowance";

export type AskReview = {
  id: number;
  created_at: string;
  question: string;
  reply: string | null;
  sources: { chunk_id: number; title: string; reference: string }[];
  passages: AskTrace["passages"];
  retrieval_ms: number | null;
  total_ms: number | null;
  attempts: number | null;
  problems: string[][];
  ok: boolean;
  failure: string | null;
  rating: "good" | "needs_work" | "wrong" | null;
  note: string | null;
  expected: string | null;
};

/**
 * One test question from the admin bench: answered exactly as a
 * candidate's would be (the same retrieval, prompt and checks), timed,
 * and kept in ask_reviews for rating. Counts towards the site's daily AI
 * ceiling like any other question, but not towards an allowance.
 */
export async function askForReview(question: string): Promise<{ review?: AskReview; error?: string }> {
  await requireAdmin();
  const message = String(question ?? "").trim();
  if (!message) return { error: "Type a question first." };
  if (message.length > CHAT_MESSAGE_LIMIT) return { error: `Keep it under ${CHAT_MESSAGE_LIMIT} characters.` };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again." };

  const admin = createAdminClient();
  const begun = await beginAsk(admin, user.id, await getPlan(supabase, user.id));
  if (!begun.ok) return { error: "The daily AI ceiling has been reached, or the check is unavailable. Try later." };

  const trace: AskTrace = { retrievalMs: 0, modelMs: [], problems: [], passages: [] };
  const started = Date.now();
  const outcome = await answerFromLibrary({ history: [], message, trace });
  const total = Date.now() - started;

  const row = {
    created_by: user.id,
    question: message,
    reply: outcome.ok ? outcome.reply : null,
    sources: outcome.ok ? outcome.sources : [],
    passages: trace.passages,
    retrieval_ms: trace.retrievalMs,
    total_ms: total,
    attempts: trace.modelMs.length,
    problems: trace.problems,
    ok: outcome.ok,
    failure: outcome.ok ? null : outcome.reason,
  };
  const { data, error } = await admin.from("ask_reviews").insert(row).select("*").single();
  if (error) {
    return {
      error:
        error.code === "42P01"
          ? "Run supabase/phase48-ask-reviews.sql first, so reviews can be kept."
          : "The answer could not be saved.",
    };
  }
  revalidatePath("/admin/ask");
  return { review: data as AskReview };
}

/** The owner's verdict on one answer. */
export async function rateReview(input: {
  id: number;
  rating: "good" | "needs_work" | "wrong";
  note: string;
  expected: string;
}): Promise<{ error?: string }> {
  await requireAdmin();
  if (!["good", "needs_work", "wrong"].includes(input.rating)) return { error: "Choose a rating." };
  const { error } = await createAdminClient()
    .from("ask_reviews")
    .update({
      rating: input.rating,
      note: String(input.note ?? "").slice(0, 4000) || null,
      expected: String(input.expected ?? "").slice(0, 4000) || null,
      rated_at: new Date().toISOString(),
    })
    .eq("id", Number(input.id));
  if (error) return { error: "The rating could not be saved." };
  revalidatePath("/admin/ask");
  return {};
}
