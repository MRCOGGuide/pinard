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

  // Weak on the evidence of answers, never on a 0% that only means unasked.
  const answered = units.filter((u) => (u.attempts ?? 0) > 0);
  const weakest = [...answered]
    .filter((u) => u.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map((u) => u.title);

  const input = {
    exam_part: examLabel,
    days_remaining: plan.meta.days_remaining,
    weakest_sections: weakest,
    answered_topics: answered.length,
    total_topics: units.filter((u) => u.covered !== false).length,
    // What the candidate said, where answers have not yet spoken (lib/confidence).
    rated_not_confident: units.filter((u) => u.source === "rating" && u.rating === "not_confident").map((u) => u.title).slice(0, 3),
    confidence_overridden: units.filter((u) => u.rating === "confident" && u.source === "answers" && u.band !== "secure").map((u) => u.title),
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
    return text && text.type === "text" ? withoutDashes(text.text.trim()) : null;
  } catch (error) {
    console.error("Plan narrative generation failed (non-fatal):", error);
    return null;
  }
}

/**
 * The narrative without em or en dashes, which the house style does
 * not use. The prompt asks for none; this catches any that come back
 * anyway, and the narratives stored before the prompt said so. An en
 * dash is only taken when spaced, so a range of weeks is left alone.
 */
export function withoutDashes(text: string): string {
  const dash = /\s*\u2014\s*|\s+\u2013\s+/;
  return text
    .replace(new RegExp(`(?:${dash.source})(?=[a-z])`, "g"), ", ")
    .replace(new RegExp(dash.source, "g"), ". ")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".");
}

/** Deterministic fallback used when the AI narrative is unavailable. */
export function fallbackNarrative(
  plan: StudyPlan,
  units: PlanUnit[]
): string {
  const answered = units.filter((u) => (u.attempts ?? 0) > 0);
  const notConfident = units.filter((u) => u.source === "rating" && u.rating === "not_confident").map((u) => u.title).slice(0, 3);
  if (answered.length === 0 && units.some((u) => u.rating)) {
    // Rated but not yet answered: the plan follows what they said, and says so.
    const named =
      notConfident.length > 1 ? `${notConfident.slice(0, -1).join(", ")} and ${notConfident[notConfident.length - 1]}` : notConfident[0];
    const first = named ? `${named} come first, as you said they need the most work, ` : "";
    return `${plan.meta.days_remaining} days to go. For now this plan follows how confident you said you feel: ${first}and the topics you are confident in are asked early to confirm it. Your answers then take over, and the diagnostic tests every topic at once. Keep to it and bring every topic to 70%, the pass mark, and you are on course to pass.`;
  }
  if (answered.length === 0) {
    /*
      Nothing answered: the plan can only follow the syllabus, and says
      so (owner, 16 November 2026), rather than naming as weak three
      topics that are merely unasked.
    */
    return `${plan.meta.days_remaining} days to go. For now this plan follows the syllabus, giving the most examined topics the most time, because it has not yet seen you answer. Take the diagnostic and it reorders itself around the topics where you need the time. Keep to it and bring every topic to 70%, the pass mark, and you are on course to pass.`;
  }
  const weakest = [...answered]
    .filter((u) => u.accuracy < 70)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)
    .map((u) => u.title);

  /*
    Short, and ending in support (owner, 14 November 2026: summarise it,
    and tell candidates that a plan kept is a realistic way to pass). It
    says "on course to pass", never that they will pass: no plan can
    promise an exam.
  */
  const named =
    weakest.length > 1 ? `${weakest.slice(0, -1).join(", ")} and ${weakest[weakest.length - 1]}` : weakest[0];
  const focus = weakest.length
    ? `Your first weeks concentrate on ${named}, where there is most to gain.`
    : `Every topic stays in rotation, so what you have secured holds.`;

  return `${plan.meta.days_remaining} days to go. ${focus} Secured topics come back for review, and the final fortnight is mixed papers. Keep to this plan and bring every topic to 70%, the pass mark, and you are on course to pass.`;
}

/** A brief written to the earlier, longer instructions: shown until the
 *  plan is next rebuilt, when the shorter one is written. */
export function isLongBrief(text: string): boolean {
  return text.split(/\s+/).filter(Boolean).length > 85;
}
