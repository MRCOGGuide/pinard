import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aidsReadModel } from "@/lib/anthropic";
import { ask, justWorkedOn, pdfBlock, STALLED_MS } from "@/lib/decision-aid-extract";
import { applyAidPatch, type AidPatch } from "@/lib/decision-aid-patch";
import { webImagePath, type AidContent } from "@/lib/decision-aid-shape";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Revising the aids the owner has marked Needs changes, from a button on
 * Admin > Decision aids (owner, 5 November 2026), so that a review no
 * longer needs a developer to carry it out.
 *
 * One model reads each aid once, with the owner's note and the picture,
 * and lists the changes; decision-aid-patch makes them. There is no second
 * model checking the first: the owner's own check is the check (AI reviews
 * of the aids proved unhelpful), so a revised aid goes back to Waiting
 * for review with a note of exactly what changed. One it cannot be sure of
 * stays at Needs changes and is listed on the page with the reason.
 *
 * As with a search, a run takes one aid at a time, as many as fit in its
 * time, with its progress in a small file in Storage for the next run.
 */

const nodeKinds = ["start", "question", "action", "outcome", "note"];
const edge = { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to"] };
const texts = { type: "array", items: { type: "string" } };
const numbers = { type: "array", items: { type: "integer" } };

export const REVISE_TOOL = {
  name: "correct_aid",
  description: "List the changes the reviewer's note asks for. Anything not listed stays exactly as it is.",
  input_schema: {
    type: "object" as const,
    properties: {
      cannot_apply: { type: "string", description: "Only if the note cannot be carried out with certainty: one plain sentence saying why. List no changes then." },
      title: { type: "string", description: "Only if the note asks for the title to change." },
      add_nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: nodeKinds } }, required: ["id", "text", "kind"] } },
      change_nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: nodeKinds } }, required: ["id"] } },
      remove_nodes: texts,
      add_edges: { type: "array", items: edge },
      remove_edges: { type: "array", items: edge },
      columns: { ...texts, description: "The whole heading row, only if the note changes it." },
      change_cells: { type: "array", items: { type: "object", properties: { row: { type: "integer" }, column: { type: "integer" }, text: { type: "string" } }, required: ["row", "column", "text"] } },
      add_rows: { type: "array", items: { type: "object", properties: { after: { type: "integer", description: "The existing row it follows; 0 for the top." }, cells: texts }, required: ["after", "cells"] } },
      remove_rows: numbers,
      add_footnotes: texts,
      change_footnotes: { type: "array", items: { type: "object", properties: { number: { type: "integer" }, text: { type: "string" } }, required: ["number", "text"] } },
      remove_footnotes: numbers,
    },
  },
};

export const REVISE_PROMPT = `You correct a decision aid: a flowchart or table transcribed from a clinical guideline. A senior clinician has checked it against the original, attached as a picture, and written a note saying what is wrong. The note is right.

Do what the note says and nothing else. You list changes, not a new copy: whatever you do not list stays word for word, so never reword, tidy, merge or reorder anything the note does not mention.

- Numbers in the note are the box ids shown in the aid. A note may also name a box by its words.
- A note written as an indented tree is exact, so read it by its indentation. Lines at the same indentation under one parent are siblings, each with its own arrow from that parent; a line indented under another is its child; "-> see box X" is an arrow to box X. Never turn siblings into a chain. Where the indentation contradicts itself, follow the picture.
- Boxes said to be at the same level, or to be done in any order, are siblings: each has its arrow from the box above and to the box below, and none to each other. Remove any arrows that join them to each other.
- Where the note says what a box comes from, that replaces the arrows into it: remove its other incoming arrows, unless the note says the new arrow is in addition to them.
- Use the note's own words where it gives them. Where it asks for something without wording it ("the table is missing"), copy it from the picture exactly as printed.
- Whatever the note writes out that the aid does not have, such as a table or a list of options, must be added. In a flowchart each item becomes its own box, with its details in the box's text, and arrows join them to the box they follow.
- To change an arrow's label, remove the arrow and add it again.
- A note may carry earlier history ("Corrected on ...", "Your note: ..."). That work is done; act only on what the aid as it stands does not yet show.
- If the note asks a question, wants the whole aid removed, is unclear, or cannot be carried out with certainty, set cannot_apply and list no changes. A wrong correction is worse than none.

Go through the note sentence by sentence before you answer, so that every one of them is carried out.`;

/** The aid with the numbers the changes refer to. */
export function aidForModel(title: string, kind: string, c: AidContent): string {
  const lines = [`Title: ${title}`, `Kind: ${kind}`];
  if (c.nodes?.length) {
    lines.push("Boxes:", ...c.nodes.map((n) => `(${n.id}) [${n.kind}] ${n.text}`));
    lines.push("Arrows:", ...(c.edges ?? []).map((e) => `${e.from} -> ${e.to}${e.label ? ` [${e.label}]` : ""}`));
  }
  if (c.columns?.length) lines.push(`Headings: ${c.columns.join(" | ")}`);
  (c.rows ?? []).forEach((r, i) => lines.push(`Row ${i + 1}: ${r.join(" | ")}`));
  (c.footnotes ?? []).forEach((f, i) => lines.push(`Footnote ${i + 1}: ${f}`));
  return lines.join("\n");
}

/** The most the model is sent in one picture; the web-sized copy stands in above it. */
const MAX_PICTURE_BYTES = 3_500_000;

async function pictureBlocks(paths: string[]): Promise<Anthropic.ContentBlockParam[]> {
  const storage = createAdminClient().storage.from("sources");
  const read = async (path: string) => {
    const { data } = await storage.download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  };
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const path of paths) {
    let bytes = await read(path);
    if (path.endsWith(".pdf")) {
      if (bytes) blocks.push(pdfBlock(bytes));
      continue;
    }
    let media: "image/png" | "image/jpeg" = "image/png";
    if (!bytes || bytes.length > MAX_PICTURE_BYTES) {
      bytes = await read(webImagePath(path));
      media = "image/jpeg";
    }
    if (bytes) blocks.push({ type: "image", source: { type: "base64", media_type: media, data: Buffer.from(bytes).toString("base64") } });
  }
  return blocks;
}

type AidRow = { id: number; document_id: number; title: string; kind: string; status: string; content: AidContent; owner_note: string | null; image_paths: string[] | null };

/** The model's reading of a note: the changes it lists, or why it cannot. */
export async function askForChanges(aid: Pick<AidRow, "title" | "kind" | "content" | "image_paths">, note: string) {
  return ask<AidPatch & { cannot_apply?: string }>(aidsReadModel(), REVISE_PROMPT, [
    ...(await pictureBlocks(aid.image_paths ?? [])),
    { type: "text", text: `THE AID AS IT STANDS\n${aidForModel(aid.title, aid.kind, aid.content)}\n\nTHE NOTE\n${note}` },
  ], REVISE_TOOL, 8000);
}

export type Revision = { revised: boolean; title: string; why?: string; changes?: string[]; eur: number };

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Revises one aid. With save false it only reports what it would change. */
export async function reviseAid(id: number, save = true): Promise<Revision> {
  const db = createAdminClient();
  const { data } = await db.from("decision_aids").select("id,document_id,title,kind,status,content,owner_note,image_paths").eq("id", id).single();
  const aid = data as AidRow | null;
  if (!aid) return { revised: false, title: `Aid ${id}`, why: "it could not be found", eur: 0 };
  if (aid.status !== "needs_changes") return { revised: false, title: aid.title, why: "it is no longer marked Needs changes", eur: 0 };
  const note = aid.owner_note?.trim();
  if (!note) return { revised: false, title: aid.title, why: "it has no note saying what to change", eur: 0 };

  const r = await askForChanges(aid, note);
  if (r.input.cannot_apply) return { revised: false, title: aid.title, why: r.input.cannot_apply, eur: r.eur };
  const result = applyAidPatch(aid.content, aid.title, r.input);
  if ("error" in result) return { revised: false, title: aid.title, why: `the change could not be made: ${result.error}`, eur: r.eur };
  if (!result.changes.length) return { revised: false, title: aid.title, why: "the note asks for nothing the aid does not already show", eur: r.eur };
  if (!save) return { revised: false, title: aid.title, changes: result.changes, eur: r.eur };

  // What it said before, so that a wrong correction can be put back.
  const before = await db.storage.from("sources").upload(
    `aids/${aid.document_id}/before-revision-${aid.id}-${Date.now()}.json`,
    new Blob([JSON.stringify({ title: aid.title, content: aid.content, owner_note: aid.owner_note })], { type: "application/json" }),
    { contentType: "application/json" },
  );
  if (before.error) throw new Error(`Keeping the earlier version failed: ${before.error.message}`);

  const { error } = await db.from("decision_aids").update({
    content: result.content,
    title: result.title ?? aid.title,
    status: "draft",
    owner_note: `Corrected on ${today()}; please check and approve. ${result.changes.join(" ")}\n\nYour note: ${note}`.slice(0, 4000),
    updated_at: new Date().toISOString(),
  }).eq("id", aid.id).eq("status", "needs_changes");
  if (error) throw new Error(`Saving the correction failed: ${error.message}`);
  return { revised: true, title: aid.title, changes: result.changes, eur: r.eur };
}

// ---------- a run, one aid at a time ----------

export type RevisionRun = {
  state: "running" | "done" | "stopped";
  ids: number[];
  /** How many of ids have been dealt with. */
  next: number;
  revised: number;
  problems: { id: number; title: string; why: string }[];
  eur: number;
  message?: string;
  updated_at: string;
};

const RUN_FILE = "aids/revision-run.json";

export const runStalled = (run: RevisionRun) => run.state === "running" && Date.now() - Date.parse(run.updated_at) > STALLED_MS;
/** Being worked on now, so the background workflow leaves it alone. */
export const runBusy = (run: RevisionRun) => run.state === "running" && justWorkedOn(run.updated_at);

export async function readRun(): Promise<RevisionRun | null> {
  const { data } = await createAdminClient().storage.from("sources").download(RUN_FILE);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as RevisionRun;
  } catch {
    return null;
  }
}

export async function writeRun(run: RevisionRun): Promise<void> {
  run.updated_at = new Date().toISOString();
  const { error } = await createAdminClient().storage.from("sources").upload(RUN_FILE, new Blob([JSON.stringify(run)], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Saving the run's progress failed: ${error.message}`);
}

export async function startRun(): Promise<RevisionRun> {
  const { data } = await createAdminClient().from("decision_aids").select("id").eq("status", "needs_changes").order("id");
  const ids = (data ?? []).map((a: { id: number }) => a.id);
  return { state: ids.length ? "running" : "done", ids, next: 0, revised: 0, problems: [], eur: 0, updated_at: new Date().toISOString() };
}

/** One step: revises the next aid. One that cannot be revised is reported, and the run goes on. */
export async function stepRun(run: RevisionRun): Promise<void> {
  const id = run.ids[run.next];
  try {
    const r = await reviseAid(id);
    run.eur += r.eur;
    if (r.revised) run.revised += 1;
    else run.problems.push({ id, title: r.title, why: r.why ?? "it could not be revised" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message)) {
      run.state = "stopped";
      run.message = "The model's daily limit was reached. Press the button later to carry on.";
      return;
    }
    run.problems.push({ id, title: `Aid ${id}`, why: message.slice(0, 200) });
  }
  run.next += 1;
  if (run.next >= run.ids.length) run.state = "done";
}
