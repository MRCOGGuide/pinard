import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_P } from "@/lib/prompts";
import type { StudyPlan } from "@/lib/studyPlan";
import type { PlanUnit } from "@/lib/studyPlan";

/**
 * Plan narrative (prompt P). Claude-written, so it degrades gracefully:
 * if the Anthropic API is unavailable, returns null and the UI shows a
 * deterministic fallback instead.
 */
export async function generatePlanNarrative(
  examLabel: string,
  plan: StudyPlan,
  units: PlanUnit[]
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const weakest = [...units]
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map((u) => u.title);

  const input = {
    exam_part: examLabel,
    days_remaining: plan.meta.days_remaining,
    weakest_sections: weakest,
    totals: plan.totals,
    per_section: units.map((u) => ({
      title: u.title,
      accuracy: u.accuracy,
      band: u.band,
    })),
  };

  try {
    const client = new Anthropic();
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: PROMPT_P,
      messages: [
        {
          role: "user",
          content: `Candidate data and generated plan:\n${JSON.stringify(
            input,
            null,
            2
          )}`,
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : null;
  } catch (error) {
    console.error("Plan narrative generation failed (non-fatal):", error);
    return null;
  }
}

/** Deterministic fallback used when the AI narrative is unavailable. */
export function fallbackNarrative(
  plan: StudyPlan,
  units: PlanUnit[]
): string {
  const weakest = [...units]
    .filter((u) => u.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map((u) => u.title);

  const focus = weakest.length
    ? `Your early weeks front-load ${weakest.join(", ")}, where you have the most ground to make up.`
    : `Your plan keeps every topic in rotation to hold your progress steady.`;

  return `${plan.meta.days_remaining} days to go. ${focus} Secured topics return for spaced review roughly weekly, and the final fortnight switches to mixed mock papers so you practise across the whole syllabus under exam conditions. Steady, consistent sessions will get you there — consistency beats intensity.`;
}
