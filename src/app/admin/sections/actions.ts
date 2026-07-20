"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ExamPart } from "@/lib/types";

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
