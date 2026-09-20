import { PROMPT_P } from "@/lib/prompts";
import type { StudyPlan } from "@/lib/studyPlan";
import type { PlanUnit } from "@/lib/studyPlan";
import { claudeClient, claudeConfigured, claudeModel } from "@/lib/anthropic";

/**
 * How long a page may wait for the narrative before going without it.
 * The plan itself is already built by this point; this is the prose
 * over the top of it.
 *
 * Eight seconds because four was measured to be under it: this call
 * writes 170-190 tokens and took 4695ms, 4811ms and 5750ms on three
 * consecutive runs through Bedrock, so a four-second bound did not
 * protect the page, it just guaranteed the fallback text every time.
 */
const NARRATIVE_TIMEOUT_MS = 8000;

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
  if (!claudeConfigured()) return null;

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
    /*
      Bounded, because this runs while a candidate waits for a page.

      The narrative is decorative — fallbackNarrative below says the
      same thing deterministically — but it is generated inside the
      request that builds the study plan, and the plan is rebuilt
      whenever performance shifts materially. So answering questions is
      what triggers it.

      The SDK's defaults are two retries and a ten-minute timeout. On a
      serverless function with a ten-second limit that is not a slow
      narrative, it is a Gateway Timeout in place of the session: what
      the disabled-organisation hold actually produced. One attempt, a
      few seconds, then the deterministic text.
    */
    const client = claudeClient({ maxRetries: 0, timeout: NARRATIVE_TIMEOUT_MS });
    const model = claudeModel();
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
