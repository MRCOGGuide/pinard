/**
 * The parts of the pilot review that both the form and the server use:
 * what is scored, the shape of a review, the limits and the check. No
 * database here, so the form can import it without pulling the service
 * role into the browser.
 */

/** What is scored, in the order a candidate meets it. */
export const REVIEW_AREAS = [
  { key: "questions", label: "Questions", hint: "Accuracy, clinical realism and the standard of the exam" },
  { key: "explanations", label: "Explanations and references", hint: "Whether they teach, and whether the cited guidance supports them" },
  { key: "ask", label: "Ask Pinard", hint: "Answers from the source library" },
  { key: "mock", label: "Mock exam", hint: "The timed paper and its marking" },
  { key: "plan", label: "Diagnostic, study plan and progress", hint: "Whether the plan and the progress map felt right for you" },
  { key: "ease", label: "Design and ease of use", hint: "On a phone and on a computer" },
  { key: "overall", label: "Overall", hint: "Pinard as a whole" },
] as const;

export type ReviewAreaKey = (typeof REVIEW_AREAS)[number]["key"];

export type PilotReview = {
  /** 1 to 10, or null where they did not use that part. Overall is required. */
  scores: Record<ReviewAreaKey, number | null>;
  /** The sentence they agree may appear on the website. */
  publicComment: string;
  /** What they would change, for us only. */
  privateComment: string;
  displayName: string;
  /** "ST5, Leeds", or "Sitting Part 2 in March 2027". */
  displayDetail: string;
  /** Agreement to publish the comment, name, role and overall score. */
  consent: boolean;
};

export type StoredReview = PilotReview & {
  id: number;
  userId: string | null;
  email: string | null;
  submittedAt: string;
};

export const LIMITS = { publicComment: 400, privateComment: 2000, displayName: 80, displayDetail: 120 };

/**
 * Check and tidy what the form sent. The server is the only judge: a
 * score outside one to ten, a missing overall score, or a public comment
 * without consent is refused rather than quietly repaired, because the
 * consent in particular has to be the assessor's own.
 */
export function validateReview(input: PilotReview): { review?: PilotReview; error?: string } {
  const scores = {} as Record<ReviewAreaKey, number | null>;
  for (const area of REVIEW_AREAS) {
    const v = input.scores?.[area.key];
    if (v === null || v === undefined) {
      scores[area.key] = null;
      continue;
    }
    if (!Number.isInteger(v) || v < 1 || v > 10) return { error: `Score ${area.label} from 1 to 10.` };
    scores[area.key] = v;
  }
  if (scores.overall === null) return { error: "Give Pinard an overall score from 1 to 10." };

  const review: PilotReview = {
    scores,
    publicComment: (input.publicComment ?? "").trim().slice(0, LIMITS.publicComment),
    privateComment: (input.privateComment ?? "").trim().slice(0, LIMITS.privateComment),
    displayName: (input.displayName ?? "").trim().slice(0, LIMITS.displayName),
    displayDetail: (input.displayDetail ?? "").trim().slice(0, LIMITS.displayDetail),
    consent: input.consent === true,
  };
  if (review.publicComment && !review.consent)
    return { error: "Tick the box to let us publish your comment, or leave the comment empty." };
  if (review.publicComment && !review.displayName)
    return { error: "Add the name or initials to show beside your comment." };
  return { review };
}

