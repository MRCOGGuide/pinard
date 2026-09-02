import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_M } from "@/lib/prompts";
import {
  fallbackCopy,
  minutesFor,
  toneBand,
  TONE_GUIDANCE,
  type ReminderFacts,
} from "@/lib/reminders";
import { ukEnglishProblems } from "@/lib/generation";
import { extractJson } from "@/lib/generation";

/**
 * Reminder copy (prompt M). Written by Claude from the candidate's own
 * data — days remaining, today's topics, target, streak, any milestone
 * — and nothing else: prompt M permits no clinical content, so there is
 * nothing here to ground and nothing to cite.
 *
 * Degrades to deterministic copy the way the plan narrative does. A
 * reminder that fails to write itself should still arrive.
 */

export type ReminderCopy = { push: string; email: string; fromAI: boolean };

const MAX_PUSH = 140;

export async function generateReminderCopy(
  facts: ReminderFacts
): Promise<ReminderCopy> {
  const fallback = fallbackCopy(facts);
  if (!process.env.ANTHROPIC_API_KEY) return { ...fallback, fromAI: false };

  const band = toneBand(facts.daysRemaining);
  const input = {
    name: facts.name || null,
    exam: facts.examLabel,
    days_to_exam: facts.daysRemaining,
    todays_sections: facts.topics,
    question_target: facts.questionTarget,
    estimated_minutes: minutesFor(facts.questionTarget),
    streak_days: facts.streak,
    recent_milestone: facts.milestone?.description ?? null,
    tone_band: `${band} — ${TONE_GUIDANCE[band]}`,
  };

  try {
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: PROMPT_M,
      messages: [
        {
          role: "user",
          content: `Candidate data:\n${JSON.stringify(input, null, 2)}`,
        },
      ],
    });

    const block = response.content.find((b) => b.type === "text");
    const raw = block && block.type === "text" ? block.text : "";
    const parsed = JSON.parse(extractJson(raw)) as {
      push?: unknown;
      email?: unknown;
    };

    const push = typeof parsed.push === "string" ? parsed.push.trim() : "";
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    if (!push || !email) return { ...fallback, fromAI: false };

    // The same UK-English rule the rest of the product is held to. A
    // reminder is short enough that a single americanism stands out.
    if (
      ukEnglishProblems(push).length > 0 ||
      ukEnglishProblems(email).length > 0
    ) {
      return { ...fallback, fromAI: false };
    }

    return { push: push.slice(0, MAX_PUSH), email, fromAI: true };
  } catch (error) {
    console.error("Reminder copy generation failed (non-fatal):", error);
    return { ...fallback, fromAI: false };
  }
}
