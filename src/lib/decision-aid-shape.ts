/**
 * Decision aids: the flowcharts, algorithms and tables inside the
 * guidelines (owner's direction, 12 October 2026). The guidelines
 * already contain the decision logic a clinician follows (the VTE risk
 * assessment chart, the chickenpox contact algorithm, the timing-of-birth
 * table), so Pinard follows those, transcribed as drawn, instead of
 * rebuilding management from the prose.
 *
 * Types and a plain-text rendering only, so the admin page, the build
 * script and Ask Pinard share one shape.
 */

export type AidKind = "flowchart" | "table" | "box";
export type AidStatus = "draft" | "approved" | "needs_changes" | "rejected";

export type AidNode = { id: string; text: string; kind: "start" | "question" | "action" | "outcome" | "note" };
export type AidEdge = { from: string; to: string; label?: string };

export type AidContent = {
  nodes?: AidNode[];
  edges?: AidEdge[];
  columns?: string[];
  rows?: string[][];
  footnotes?: string[];
};

export type AidFlag = { source: "wording" | "image" | "text"; detail: string };

export type DecisionAid = {
  document_id: number;
  page: number;
  position: number;
  title: string;
  kind: AidKind;
  decision: string;
  applies_to: string[];
  content: AidContent;
  flags: AidFlag[];
};

/**
 * The aid as text a model or a reader can follow: a flowchart as an
 * indented tree from its starting box along its arrows, a table as rows.
 */
export function renderAid(aid: Pick<DecisionAid, "title" | "kind" | "content">): string {
  const c = aid.content;
  const lines: string[] = [aid.title];
  if (aid.kind === "flowchart" && c.nodes?.length) {
    const byId = new Map(c.nodes.map((n) => [n.id, n]));
    const out = new Map<string, AidEdge[]>();
    for (const e of c.edges ?? []) out.set(e.from, [...(out.get(e.from) ?? []), e]);
    const hasIncoming = new Set((c.edges ?? []).map((e) => e.to));
    const starts = c.nodes.filter((n) => !hasIncoming.has(n.id));
    const seen = new Set<string>();
    const walk = (id: string, depth: number, label?: string) => {
      const n = byId.get(id);
      if (!n) return;
      const pad = "  ".repeat(depth);
      const lead = label ? `[${label}] ` : "";
      if (seen.has(id)) {
        lines.push(`${pad}${lead}-> see box ${id}`);
        return;
      }
      seen.add(id);
      lines.push(`${pad}${lead}(${id}) ${n.text.replace(/\s+/g, " ").trim()}`);
      for (const e of out.get(id) ?? []) walk(e.to, depth + 1, e.label);
    };
    for (const s of starts.length ? starts : [c.nodes[0]]) walk(s.id, 0);
    for (const n of c.nodes) if (!seen.has(n.id)) lines.push(`(${n.id}) ${n.text.replace(/\s+/g, " ").trim()}`);
  } else {
    if (c.columns?.length) lines.push(c.columns.join(" | "));
    for (const r of c.rows ?? []) lines.push(r.join(" | "));
  }
  if (c.footnotes?.length) lines.push(...c.footnotes.map((f) => `Note: ${f}`));
  return lines.join("\n");
}
