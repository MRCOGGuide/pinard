"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  LEGAL_DOCS,
  restoreLegalDocument,
  saveLegalDetails,
  saveLegalDocument,
  type LegalDocKey,
} from "@/lib/legal";

function refreshAll() {
  revalidatePath("/admin/legal");
  for (const d of LEGAL_DOCS) revalidatePath(d.href);
}

export async function saveDetails(input: Record<string, string>): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await saveLegalDetails(input);
  if (!result.error) refreshAll();
  return result;
}

export async function savePage(doc: LegalDocKey, body: string): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await saveLegalDocument(doc, body);
  if (!result.error) refreshAll();
  return result;
}

export async function restorePage(doc: LegalDocKey): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await restoreLegalDocument(doc);
  if (!result.error) refreshAll();
  return result;
}
