"use server";

import { getAccess, hasFullAccess } from "@/lib/access";
import {
  ASK_TOPUP_QUESTIONS,
  getAskAllowance,
  refundAskAllowance,
  spendAskAllowance,
  type AskAllowance,
} from "@/lib/askAllowance";
import {
  CHAT_MESSAGE_LIMIT,
  type ChatMessage,
  type ChatSource,
} from "@/lib/chat";
import { answerFromLibrary } from "@/lib/chat-service";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AskLibraryResult = {
  error?: string;
  reply?: string;
  sources?: ChatSource[];
  /** What is left afterwards, so the box can say so without a reload. */
  allowance?: AskAllowance;
  /** The allowance ran out: the page offers a top-up rather than a wall. */
  outOfAllowance?: boolean;
};

/**
 * The Ask box on Today: any revision question, answered from every
 * uploaded document (prompt A). Unlike the follow-up chat under a
 * question card, nothing scopes this to one section — retrieval runs
 * across the whole library.
 *
 * One answer is shown at a time, but the last few exchanges travel with
 * the question, so "and in twins?" knows what it is asking about. The
 * thread is held by the page for the visit and never stored:
 * chat_messages is keyed to a question, and an open question has none.
 */
export async function askLibrary(input: {
  message: string;
  history?: ChatMessage[];
}): Promise<AskLibraryResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to ask Pinard a question." };

  const message = input.message.trim();
  if (!message) return { error: "Type a question first." };
  if (message.length > CHAT_MESSAGE_LIMIT) {
    return { error: `Keep it under ${CHAT_MESSAGE_LIMIT} characters.` };
  }

  const access = await getAccess(supabase, user.id);
  if (!hasFullAccess(access)) {
    return { error: "Ask Pinard is part of the full subscription." };
  }

  // History comes from the browser, so it is treated as untrusted: shape
  // checked, capped at three exchanges, and used for nothing but the
  // model's own context.
  const history: ChatMessage[] = (
    Array.isArray(input.history) ? input.history : []
  )
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  // Spent before the answer, not after: checking the balance and
  // counting later lets a burst of simultaneous questions all see the
  // same last one. A failed answer is refunded below.
  const admin = createAdminClient();
  const spend =
    access === "admin" ? "none" : await spendAskAllowance(admin, user.id);
  if (access !== "admin" && spend === "none") {
    return {
      outOfAllowance: true,
      allowance: await getAskAllowance(supabase, user.id),
      error: `You have used this month's ${ASK_TOPUP_QUESTIONS} Ask Pinard questions.`,
    };
  }

  const outcome = await answerFromLibrary({ history, message });

  if (!outcome.ok) {
    await refundAskAllowance(admin, user.id, spend);
    await admin.from("generation_failures").insert({
      reason: `${outcome.reason} (ask box)`,
      raw_response: outcome.raw || null,
    });
    return {
      error:
        "Pinard could not answer that from the source material. It has been logged for review — try rephrasing.",
    };
  }

  return {
    reply: outcome.reply,
    sources: outcome.sources,
    allowance: await getAskAllowance(supabase, user.id, access === "admin"),
  };
}
