"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { resolveCandidateReport } from "@/lib/questionReports";

export async function setReportResolved(ref: string, resolved: boolean): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await resolveCandidateReport(ref, resolved);
  if (!result.error) {
    revalidatePath("/admin/reports");
    revalidatePath("/admin");
  }
  return result;
}
