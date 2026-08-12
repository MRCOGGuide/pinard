"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { GLOBAL_SECTION_ID } from "@/lib/sections";
import type { QuestionFormat, QuestionOption } from "@/lib/types";

export type ExampleInput = {
  /** GLOBAL_SECTION_ID (0) stores null — applies to every section. */
  sectionId: number;
  format: QuestionFormat;
  stem: string;
  options: QuestionOption[];
  correctKey: string;
  rationale: string;
  sourceNote: string;
};

/** 0 is the "all sections" sentinel, stored as a null section_id. */
function sectionValue(sectionId: number): number | null {
  return sectionId === GLOBAL_SECTION_ID ? null : sectionId;
}

function validate(input: ExampleInput): string | null {
  if (input.sectionId < 0) return "Choose a section";
  if (!input.stem.trim()) return "The stem is required";
  const filled = input.options.filter((o) => o.text.trim());
  if (filled.length < 2) return "At least two options are required";
  if (filled.length !== input.options.length)
    return "Every option needs text (remove empty ones)";
  if (!input.options.some((o) => o.key === input.correctKey))
    return "Pick the correct answer";
  return null;
}

export async function createExample(input: ExampleInput) {
  const problem = validate(input);
  if (problem) return { error: problem };

  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("example_questions").insert({
    section_id: sectionValue(input.sectionId),
    format: input.format,
    stem: input.stem.trim(),
    options: input.options,
    correct_key: input.correctKey,
    rationale: input.rationale.trim() || null,
    source_note: input.sourceNote.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}

export async function updateExample(id: number, input: ExampleInput) {
  const problem = validate(input);
  if (problem) return { error: problem };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("example_questions")
    .update({
      section_id: sectionValue(input.sectionId),
      format: input.format,
      stem: input.stem.trim(),
      options: input.options,
      correct_key: input.correctKey,
      rationale: input.rationale.trim() || null,
      source_note: input.sourceNote.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}

export async function deleteExample(id: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("example_questions")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}

// ---------- EMQ sets ----------
// One shared option list + lead-in + several scenarios, stored as one
// row per scenario sharing emq_group_id.

export type EmqScenarioInput = {
  stem: string;
  correctKey: string;
  rationale: string;
};

export type EmqGroupInput = {
  sectionId: number;
  leadIn: string;
  options: QuestionOption[];
  scenarios: EmqScenarioInput[];
  sourceNote: string;
};

function validateEmq(input: EmqGroupInput): string | null {
  if (input.sectionId < 0) return "Choose a section";
  if (!input.leadIn.trim()) return "The lead-in instruction is required";
  const filled = input.options.filter((o) => o.text.trim());
  if (filled.length < 4) return "An EMQ option list needs at least four options";
  if (filled.length !== input.options.length)
    return "Every option needs text (remove empty ones)";
  if (input.scenarios.length === 0) return "Add at least one scenario";
  for (const scenario of input.scenarios) {
    if (!scenario.stem.trim()) return "Every scenario needs text";
    if (!input.options.some((o) => o.key === scenario.correctKey))
      return "Every scenario needs a correct option";
  }
  return null;
}

function emqRows(groupId: string, input: EmqGroupInput) {
  return input.scenarios.map((scenario) => ({
    section_id: sectionValue(input.sectionId),
    format: "emq" as const,
    stem: scenario.stem.trim(),
    options: input.options,
    correct_key: scenario.correctKey,
    rationale: scenario.rationale.trim() || null,
    source_note: input.sourceNote.trim() || null,
    lead_in: input.leadIn.trim(),
    emq_group_id: groupId,
  }));
}

export async function createEmqGroup(input: EmqGroupInput) {
  const problem = validateEmq(input);
  if (problem) return { error: problem };

  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("example_questions")
    .insert(emqRows(crypto.randomUUID(), input));
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}

export async function updateEmqGroup(groupId: string, input: EmqGroupInput) {
  const problem = validateEmq(input);
  if (problem) return { error: problem };

  const { supabase } = await requireAdmin();

  const { error: deleteError } = await supabase
    .from("example_questions")
    .delete()
    .eq("emq_group_id", groupId);
  if (deleteError) return { error: deleteError.message };

  const { error } = await supabase
    .from("example_questions")
    .insert(emqRows(groupId, input));
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}

export async function deleteEmqGroup(groupId: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase
    .from("example_questions")
    .delete()
    .eq("emq_group_id", groupId);
  if (error) return { error: error.message };

  revalidatePath("/admin/examples");
  return {};
}
