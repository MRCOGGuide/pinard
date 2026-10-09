"use server";

import { getAccess, hasFullAccess } from "@/lib/access";
import {
  askRefusal,
  beginAsk,
  getAskAllowance,
  refundAskAllowance,
  type AskAllowance,
} from "@/lib/askAllowance";
import { signText, verifyText } from "@/lib/signing";
import {
  CHAT_MESSAGE_LIMIT,
  type ChatMessage,
  type ChatSource,
} from "@/lib/chat";
import { answerFromLibrary } from "@/lib/chat-service";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveFeedback } from "@/lib/pilot";

export type AskLibraryResult = {
  error?: string;
  reply?: string;
  sources?: ChatSource[];
  /** What is left afterwards, so the box can say so without a reload. */
  allowance?: AskAllowance;
  /** The allowance ran out: the page offers a top-up rather than a wall. */
  outOfAllowance?: boolean;
  /** The server's signature over `reply`, sent back with it as history. */
  signature?: string;
};

/** What Today's Ask signs its answers as (lib/signing). */
const ASK_REPLY = "ask-reply";

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
  const supabase = await createClient();
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
  const offered: ChatMessage[] = (
    Array.isArray(input.history) ? input.history : []
  )
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-6);
  /* An answer comes back as history only if the server signed it when it
     gave it; anything else claiming to be Pinard is dropped (security
     audit L1). Questions are the candidate's own words either way. */
  const history: ChatMessage[] = [];
  for (const m of offered) {
    if (m.role === "assistant" && !(await verifyText(ASK_REPLY, m.content, m.sig))) continue;
    history.push({ role: m.role, content: m.content.slice(0, CHAT_MESSAGE_LIMIT * 2) });
  }

  // Spent before the answer, not after: checking the balance and
  // counting later lets a burst of simultaneous questions all see the
  // same last one. A failed answer is refunded below.
  const admin = createAdminClient();
  const begun = await beginAsk(admin, user.id, access === "admin");
  if (!begun.ok) {
    return {
      outOfAllowance: begun.reason === "allowance",
      allowance: await getAskAllowance(supabase, user.id),
      error: askRefusal(begun.reason),
    };
  }
  const spend = begun.spend;

  const outcome = await answerFromLibrary({ history, message });

  if (!outcome.ok) {
    await refundAskAllowance(admin, user.id, spend);
    await admin.from("generation_failures").insert({
      reason: `${outcome.reason} (ask box)`,
      raw_response: outcome.raw || null,
    });
    return {
      // Rephrasing only helps when the question was the problem.
      error:
        outcome.kind === "unavailable"
          ? "Pinard could not reach the source library just then. Nothing is wrong with your question, it has been logged, and trying again usually works."
          : "Pinard could not answer that from the source material. It has been logged for review, try rephrasing.",
    };
  }

  return {
    reply: outcome.reply,
    sources: outcome.sources,
    allowance: await getAskAllowance(supabase, user.id, access === "admin"),
    signature: await signText(ASK_REPLY, outcome.reply),
  };
}

/**
 * A sentence from someone using the product, with the page they were
 * on when they wrote it.
 *
 * Signed in only: an open box on a public page is a spam target, and
 * the feedback worth having comes from people who are inside.
 */
export async function sendFeedback(input: {
  message: string;
  path: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };
  return saveFeedback({
    userId: user.id,
    path: input.path,
    message: input.message,
  });
}
