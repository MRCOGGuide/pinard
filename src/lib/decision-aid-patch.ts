import type { AidContent, AidEdge, AidNode } from "@/lib/decision-aid-shape";

/**
 * A correction to a decision aid, as a list of changes rather than a new
 * copy (owner, 5 November 2026: revise the aids marked Needs changes from
 * a button).
 *
 * The owner has already checked every word of an aid against the picture,
 * so a correction must touch only what the note names. A model asked for a
 * fresh copy can reword anything; here it can only list changes, this file
 * makes them, and the words left out stay exactly as they were. What is
 * reported as changed comes from here too, not from the model's account of
 * itself. Boxes are named by their ids, rows and columns count from 1.
 */
export type AidPatch = {
  title?: string;
  add_nodes?: AidNode[];
  change_nodes?: { id: string; text?: string; kind?: AidNode["kind"] }[];
  remove_nodes?: string[];
  add_edges?: AidEdge[];
  remove_edges?: { from: string; to: string }[];
  columns?: string[];
  change_cells?: { row: number; column: number; text: string }[];
  add_rows?: { after: number; cells: string[] }[];
  remove_rows?: number[];
  add_footnotes?: string[];
  change_footnotes?: { number: number; text: string }[];
  remove_footnotes?: number[];
};

export type PatchResult = { content: AidContent; title?: string; changes: string[] } | { error: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function applyAidPatch(before: AidContent, beforeTitle: string, patch: AidPatch): PatchResult {
  const changes: string[] = [];
  let nodes: AidNode[] = (before.nodes ?? []).map((n) => ({ ...n }));
  let edges: AidEdge[] = (before.edges ?? []).map((e) => ({ ...e }));
  const hasNode = (id: string) => nodes.some((n) => n.id === id);

  for (const id of patch.remove_nodes ?? []) {
    if (!hasNode(id)) return { error: `there is no box ${id} to remove` };
    nodes = nodes.filter((n) => n.id !== id);
    edges = edges.filter((e) => e.from !== id && e.to !== id);
    changes.push(`Box ${id} removed, with its arrows.`);
  }
  for (const c of patch.change_nodes ?? []) {
    const node = nodes.find((n) => n.id === c.id);
    if (!node) return { error: `there is no box ${c.id} to change` };
    if (c.text !== undefined && c.text !== node.text) {
      node.text = c.text;
      changes.push(`Box ${c.id} reworded.`);
    }
    if (c.kind) node.kind = c.kind;
  }
  for (const n of patch.add_nodes ?? []) {
    if (hasNode(n.id)) return { error: `box ${n.id} already exists` };
    nodes.push({ id: n.id, text: n.text, kind: n.kind ?? "action" });
    changes.push(`Box ${n.id} added.`);
  }
  for (const e of patch.remove_edges ?? []) {
    if (!edges.some((x) => x.from === e.from && x.to === e.to)) return { error: `there is no arrow from ${e.from} to ${e.to} to remove` };
    edges = edges.filter((x) => !(x.from === e.from && x.to === e.to));
    changes.push(`Arrow from ${e.from} to ${e.to} removed.`);
  }
  for (const e of patch.add_edges ?? []) {
    if (!hasNode(e.from) || !hasNode(e.to)) return { error: `an arrow from ${e.from} to ${e.to} needs both boxes to exist` };
    if (edges.some((x) => x.from === e.from && x.to === e.to && (x.label ?? "") === (e.label ?? ""))) continue;
    edges.push(e.label ? { from: e.from, to: e.to, label: e.label } : { from: e.from, to: e.to });
    changes.push(`Arrow added from ${e.from} to ${e.to}${e.label ? `, labelled "${e.label}"` : ""}.`);
  }

  const columns = patch.columns ?? before.columns;
  if (patch.columns && !same(patch.columns, before.columns)) changes.push("Column headings changed.");

  const oldRows = before.rows ?? [];
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= oldRows.length;
  const changed = oldRows.map((r) => [...r]);
  for (const c of patch.change_cells ?? []) {
    if (!inRange(c.row) || !Number.isInteger(c.column) || c.column < 1 || c.column > changed[c.row - 1].length) {
      return { error: `there is no cell at row ${c.row}, column ${c.column}` };
    }
    if (changed[c.row - 1][c.column - 1] === c.text) continue;
    changed[c.row - 1][c.column - 1] = c.text;
    changes.push(`Row ${c.row}, column ${c.column} changed.`);
  }
  const removed = new Set(patch.remove_rows ?? []);
  for (const n of removed) {
    if (!inRange(n)) return { error: `there is no row ${n} to remove` };
    changes.push(`Row ${n} removed.`);
  }
  for (const a of patch.add_rows ?? []) {
    if (a.after !== 0 && !inRange(a.after)) return { error: `there is no row ${a.after} to add after` };
    changes.push(a.after === 0 ? "Row added at the top." : `Row added after row ${a.after}.`);
  }
  const addedAfter = (n: number) => (patch.add_rows ?? []).filter((a) => a.after === n).map((a) => a.cells);
  const rows = [...addedAfter(0), ...changed.flatMap((r, i) => [...(removed.has(i + 1) ? [] : [r]), ...addedAfter(i + 1)])];

  const oldNotes = before.footnotes ?? [];
  const notes = [...oldNotes];
  for (const c of patch.change_footnotes ?? []) {
    if (!Number.isInteger(c.number) || c.number < 1 || c.number > notes.length) return { error: `there is no footnote ${c.number}` };
    if (notes[c.number - 1] === c.text) continue;
    notes[c.number - 1] = c.text;
    changes.push(`Footnote ${c.number} changed.`);
  }
  const cut = new Set(patch.remove_footnotes ?? []);
  for (const n of cut) {
    if (!Number.isInteger(n) || n < 1 || n > notes.length) return { error: `there is no footnote ${n} to remove` };
    changes.push(`Footnote ${n} removed.`);
  }
  const footnotes = [...notes.filter((_, i) => !cut.has(i + 1)), ...(patch.add_footnotes ?? [])];
  (patch.add_footnotes ?? []).forEach(() => changes.push("Footnote added."));

  const title = patch.title?.trim() && patch.title.trim() !== beforeTitle ? patch.title.trim() : undefined;
  if (title) changes.push("Title changed.");

  return { content: { ...before, nodes, edges, columns, rows, footnotes }, title, changes };
}
