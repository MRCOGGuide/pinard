"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ExamPart, SectionPriority } from "@/lib/types";

export async function createSection(
  exam: ExamPart,
  title: string,
  parentId: number | null
) {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const { supabase } = await requireAdmin();

  let query = supabase
    .from("sections")
    .select("sort_order")
    .eq("exam", exam)
    .order("sort_order", { ascending: false })
    .limit(1);
  query =
    parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);
  const { data: last } = await query;

  const { error } = await supabase.from("sections").insert({
    exam,
    title: trimmed,
    parent_id: parentId,
    sort_order: (last?.[0]?.sort_order ?? -1) + 1,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return {};
}

export async function renameSection(id: number, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { error: "Title is required" };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("sections")
    .update({ title: trimmed })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return {};
}

export async function setSectionActive(id: number, isActive: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("sections")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return {};
}

export async function moveSection(id: number, direction: "up" | "down") {
  const { supabase } = await requireAdmin();

  const { data: section } = await supabase
    .from("sections")
    .select("*")
    .eq("id", id)
    .single();
  if (!section) return { error: "Section not found" };

  let query = supabase
    .from("sections")
    .select("id, sort_order")
    .eq("exam", section.exam)
    .order("sort_order");
  query =
    section.parent_id === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", section.parent_id);
  const { data: siblings } = await query;
  if (!siblings) return { error: "Could not load siblings" };

  const index = siblings.findIndex((s) => s.id === id);
  const neighbour = siblings[direction === "up" ? index - 1 : index + 1];
  if (!neighbour) return {}; // already at the edge

  await supabase
    .from("sections")
    .update({ sort_order: neighbour.sort_order })
    .eq("id", id);
  await supabase
    .from("sections")
    .update({ sort_order: section.sort_order })
    .eq("id", neighbour.id);

  revalidatePath("/admin/sections");
  return {};
}

/**
 * Move a section elsewhere in the two-level tree: a sub-topic to a
 * different parent, a sub-topic promoted to a top-level section, or a
 * childless section demoted under a parent. Documents, questions and
 * progress keep pointing at the same section id, so nothing is lost.
 */
export async function reparentSection(id: number, newParentId: number | null) {
  const { supabase } = await requireAdmin();

  const { data: section } = await supabase
    .from("sections")
    .select("*")
    .eq("id", id)
    .single();
  if (!section) return { error: "Section not found" };
  if (section.parent_id === newParentId) return {};

  if (newParentId !== null) {
    if (newParentId === id) return { error: "A section cannot be its own parent" };

    const { data: target } = await supabase
      .from("sections")
      .select("id, exam, parent_id")
      .eq("id", newParentId)
      .single();
    if (!target) return { error: "Destination section not found" };
    if (target.exam !== section.exam) {
      return { error: "Sections can only move within the same exam part" };
    }
    if (target.parent_id !== null) {
      return { error: "The destination must be a top-level section" };
    }

    // Two-level tree: a section that still has sub-topics can't become
    // a sub-topic itself.
    const { count } = await supabase
      .from("sections")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id);
    if ((count ?? 0) > 0) {
      return {
        error:
          "This section still has sub-topics — move them out first, then move it",
      };
    }
  }

  // Append at the end of the destination's sibling list.
  let query = supabase
    .from("sections")
    .select("sort_order")
    .eq("exam", section.exam)
    .order("sort_order", { ascending: false })
    .limit(1);
  query =
    newParentId === null
      ? query.is("parent_id", null)
      : query.eq("parent_id", newParentId);
  const { data: last } = await query;

  const { error } = await supabase
    .from("sections")
    .update({
      parent_id: newParentId,
      sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return {};
}

export async function deleteSection(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("sections").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  return {};
}

export async function setExamLive(exam: ExamPart, isLive: boolean) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("exam_availability")
    .upsert({ exam, is_live: isLive }, { onConflict: "exam" });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return {};
}

/**
 * Set a section's tier. Every section is examined; the tier decides how
 * much of a candidate's revision — and of the generated bank — it is
 * worth. Changing it changes the plan's fingerprint, so plans rebuild
 * on their owner's next visit.
 */
export async function setSectionPriority(
  id: number,
  priority: SectionPriority
) {
  const { supabase } = await requireAdmin();
  if (![1, 2, 3].includes(priority)) return { error: "Unknown priority" };

  const { error } = await supabase
    .from("sections")
    .update({ priority })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/sections");
  revalidatePath("/admin/coverage");
  return {};
}
