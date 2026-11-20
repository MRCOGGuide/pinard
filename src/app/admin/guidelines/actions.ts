"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { markChecked, runGuidelineCheck } from "@/lib/guidelineCurrency";
import { markReplaced, unmarkReplaced } from "@/lib/replacedDocuments";

/** Read the RCOG's and NICE's pages for every guideline now, rather than waiting for the quarter. */
export async function runCheckNow() {
  await requireAdmin();
  const summary = await runGuidelineCheck();
  revalidatePath("/admin/guidelines");
  revalidatePath("/admin");
  if (!summary.ok) return { error: summary.reason };
  return { checked: summary.checked, flagged: summary.flagged.length, errors: summary.errors };
}

/** An admin has looked at these and found them current (the guidelines no page check covers). */
export async function markCheckedNow(ids: number[], note?: string) {
  await requireAdmin();
  const clean = ids.filter((id) => Number.isInteger(id) && id > 0).slice(0, 1000);
  if (clean.length === 0) return { error: "Nothing chosen" };
  const result = await markChecked(clean, note?.trim() || undefined);
  revalidatePath("/admin/guidelines");
  return result;
}

/**
 * A newer edition has replaced this one. Nothing is deleted (owner, 19
 * November 2026: nothing leaves the library before launch): the old one
 * stays, is no longer searched by Ask Pinard or written from, and its
 * questions are taken out separately in the Bank.
 */
export async function setReplaced(oldId: number, byId: number | null) {
  await requireAdmin();
  const result = await markReplaced(oldId, byId);
  revalidatePath("/admin/guidelines");
  return result;
}

export async function clearReplaced(oldId: number) {
  await requireAdmin();
  const result = await unmarkReplaced(oldId);
  revalidatePath("/admin/guidelines");
  return result;
}
