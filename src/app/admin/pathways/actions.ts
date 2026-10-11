"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PATHWAY_FIELDS, type PathwayBody, type PathwayConflict } from "@/lib/pathway-shape";

const FIELD_KEYS = new Set(PATHWAY_FIELDS.map((f) => f.key as string));

async function reviewer(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * The owner's verdict on a pathway. Only an approved pathway drives a
 * live Ask Pinard answer; "needs changes" keeps it out until it is
 * redrafted, with the note saying what to change.
 */
export async function reviewPathway(input: {
  slug: string;
  status: "approved" | "needs_changes" | "draft";
  note: string;
}): Promise<{ error?: string }> {
  await requireAdmin();
  if (!["approved", "needs_changes", "draft"].includes(input.status)) return { error: "Choose approve or needs changes." };
  const { error } = await createAdminClient()
    .from("pathways")
    .update({
      status: input.status,
      owner_note: String(input.note ?? "").slice(0, 4000) || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: await reviewer(),
      updated_at: new Date().toISOString(),
    })
    .eq("slug", String(input.slug));
  if (error) return { error: "The review could not be saved." };
  revalidatePath("/admin/pathways");
  revalidatePath(`/admin/pathways/${input.slug}`);
  return {};
}

/**
 * The owner removes one line from a draft. It is kept in the removed list
 * with the reason, so nothing disappears without a trace.
 */
export async function removePathwayItem(input: {
  slug: string;
  field: string;
  index: number;
}): Promise<{ error?: string }> {
  await requireAdmin();
  if (!FIELD_KEYS.has(input.field)) return { error: "Unknown field." };
  const admin = createAdminClient();
  const { data, error } = await admin.from("pathways").select("body,removed,status").eq("slug", input.slug).single();
  if (error || !data) return { error: "Pathway not found." };
  if (data.status === "approved") return { error: "Set it back to draft before changing an approved pathway." };
  const body = data.body as PathwayBody;
  const list = body[input.field as keyof PathwayBody] ?? [];
  const item = list[input.index];
  if (!item) return { error: "That line has already gone." };
  const label = PATHWAY_FIELDS.find((f) => f.key === input.field)?.label ?? input.field;
  const next = { ...body, [input.field]: list.filter((_, i) => i !== input.index) };
  const removed = [...((data.removed as string[]) ?? []), `${label}: "${item.text}": removed by the owner`];
  const { error: saveError } = await admin
    .from("pathways")
    .update({ body: next, removed, updated_at: new Date().toISOString() })
    .eq("slug", input.slug);
  if (saveError) return { error: "The line could not be removed." };
  revalidatePath(`/admin/pathways/${input.slug}`);
  return {};
}

/**
 * Where two sources disagree, the owner says which takes priority. The
 * chosen position is the one a live answer follows; until then the
 * point is left out of answers.
 */
export async function chooseConflictPosition(input: {
  slug: string;
  conflict: number;
  position: number | null;
}): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.from("pathways").select("conflicts").eq("slug", input.slug).single();
  if (error || !data) return { error: "Pathway not found." };
  const conflicts = (data.conflicts as (PathwayConflict & { chosen?: number | null })[]) ?? [];
  const target = conflicts[input.conflict];
  if (!target) return { error: "That disagreement is no longer there." };
  if (input.position !== null && !target.positions[input.position]) return { error: "Unknown position." };
  conflicts[input.conflict] = { ...target, chosen: input.position };
  const { error: saveError } = await admin
    .from("pathways")
    .update({ conflicts, updated_at: new Date().toISOString() })
    .eq("slug", input.slug);
  if (saveError) return { error: "The choice could not be saved." };
  revalidatePath(`/admin/pathways/${input.slug}`);
  return {};
}
