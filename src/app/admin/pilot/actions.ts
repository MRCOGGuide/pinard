"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createInviteCode, markFeedbackRead } from "@/lib/pilot";
import { getTestimonials, saveTestimonials, type Testimonial } from "@/lib/offer";
import { listReviews, setReviewOpen } from "@/lib/pilotReview";
import { PILOT_ACCESS_FROM, PILOT_ACCESS_UNTIL, validateWindow } from "@/lib/pilotDates";
import { writeSetting } from "@/lib/settings";

export async function makeInviteCode(input: {
  note: string;
  maxUses: number | null;
}): Promise<{ error?: string; code?: string }> {
  const { user } = await requireAdmin();
  const result = await createInviteCode({
    note: input.note,
    maxUses: input.maxUses,
    createdBy: user.id,
  });
  if (!result.error) revalidatePath("/admin/pilot");
  return result;
}

export async function markRead(id: number): Promise<void> {
  await requireAdmin();
  await markFeedbackRead(id);
  revalidatePath("/admin/pilot");
}

export async function saveQuotes(
  items: Testimonial[]
): Promise<{ error?: string }> {
  await requireAdmin();
  const cleaned = items
    .map((t) => ({
      quote: t.quote.trim().slice(0, 400),
      name: t.name.trim().slice(0, 80),
      detail: (t.detail ?? "").trim().slice(0, 120),
      // Kept through a hand edit, so correcting a typo in a published
      // review does not quietly drop the score it was given with.
      ...(typeof t.score === "number" && t.score >= 1 && t.score <= 10
        ? { score: Math.round(t.score) }
        : {}),
    }))
    .filter((t) => t.quote && t.name);
  const result = await saveTestimonials(cleaned);
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/admin/pilot");
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* The pilot's closing review                                          */
/* ------------------------------------------------------------------ */

export async function setPilotReviewOpen(open: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await setReviewOpen(open);
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/admin/pilot");
    revalidatePath("/pilot-review");
  }
  return result;
}

/**
 * Put one review's comment on the landing page, with its name, role and
 * overall score. Only a review whose author ticked the consent box can
 * be published, and only once: the quote is the key.
 */
export async function publishReview(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const review = (await listReviews()).find((r) => r.id === id);
  if (!review) return { error: "That review is no longer there." };
  if (!review.consent || !review.publicComment) return { error: "This assessor did not agree to publication." };
  const current = await getTestimonials();
  if (current.some((t) => t.quote === review.publicComment)) return {};
  const result = await saveTestimonials([
    ...current,
    {
      quote: review.publicComment,
      name: review.displayName,
      detail: review.displayDetail,
      ...(review.scores.overall ? { score: review.scores.overall } : {}),
    },
  ]);
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/admin/pilot");
  }
  return result;
}

export async function unpublishReview(id: number): Promise<{ error?: string }> {
  await requireAdmin();
  const review = (await listReviews()).find((r) => r.id === id);
  if (!review) return { error: "That review is no longer there." };
  const current = await getTestimonials();
  const result = await saveTestimonials(current.filter((t) => t.quote !== review.publicComment));
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/admin/pilot");
  }
  return result;
}

/**
 * When the pilot runs: the first and last day invite-code holders have
 * full access. Either may be empty (no start date: running now; no end
 * date: running until one is set), and both can be changed at any time.
 */
export async function setPilotWindow(from: string, until: string): Promise<{ error?: string }> {
  await requireAdmin();
  const { window, error } = validateWindow(from ?? "", until ?? "");
  if (error || !window) return { error: error ?? "Check the dates." };
  for (const [key, value] of [
    [PILOT_ACCESS_FROM, window.from ?? ""],
    [PILOT_ACCESS_UNTIL, window.until ?? ""],
  ] as const) {
    const result = await writeSetting(key, value);
    if (result.error) return result;
  }
  revalidatePath("/admin/pilot");
  revalidatePath("/");
  return {};
}
