"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createInviteCode, markFeedbackRead } from "@/lib/pilot";
import { saveTestimonials, type Testimonial } from "@/lib/offer";

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
    }))
    .filter((t) => t.quote && t.name);
  const result = await saveTestimonials(cleaned);
  if (!result.error) {
    revalidatePath("/");
    revalidatePath("/admin/pilot");
  }
  return result;
}
