import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatReference } from "@/lib/reference";
import { renderAid, type AidContent, type AidKind } from "@/lib/decision-aid-shape";

/**
 * The owner's approved decision aids, for Ask Pinard and for question
 * generation (owner, 2 November 2026: "use them for questions too").
 *
 * Only an aid the owner has approved is ever used. Ask Pinard is shown a
 * catalogue of them (one line each) in its planning step, picks those
 * that apply to the woman in the question, and follows them in its
 * answer, citing each as [aid:N]. The catalogue is read once every ten
 * minutes per server, so an approval reaches answers within ten minutes.
 */

export type ApprovedAid = {
  id: number;
  document_id: number;
  title: string;
  kind: AidKind;
  decision: string;
  /** The aid as text to follow: a flowchart as a tree, a table as rows. */
  text: string;
  source: string;
  reference: string;
};

type Row = {
  id: number;
  document_id: number;
  title: string;
  kind: AidKind;
  decision: string | null;
  applies_to: string[] | null;
  content: AidContent;
  content_documents: { title: string; source_reference: string | null; source_year: number | null } | null;
};

const TTL = 10 * 60 * 1000;
let cache: { at: number; catalogue: string; count: number } | null = null;

/**
 * One line per approved aid, for the planner to choose from:
 * "412. Unscheduled bleeding on hormonal contraception (FSRH): Figure 1 ... — when to examine and investigate".
 */
export async function approvedAidCatalogue(): Promise<{ catalogue: string; count: number }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const rows: Row[] = [];
  try {
    const db = createAdminClient();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("decision_aids")
        .select("id,document_id,title,kind,decision,applies_to,content_documents(title,source_reference,source_year)")
        .eq("status", "approved")
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) break;
    }
  } catch {
    // No catalogue is no worse than before decision aids existed.
    return { catalogue: "", count: 0 };
  }
  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const catalogue = rows
    .map((r) => {
      const doc = r.content_documents;
      const from = doc ? `${short(doc.title, 70)} (${short(doc.source_reference ?? "", 30)})` : "";
      const why = [r.decision, (r.applies_to ?? []).join(", ")].filter(Boolean).join(" | ");
      return `${r.id}. ${from}: ${short(r.title.replace(/\s+/g, " "), 90)} — ${short(why, 160)}`;
    })
    .join("\n");
  cache = { at: Date.now(), catalogue, count: rows.length };
  return cache;
}

function toAid(r: Row & { content: AidContent }): ApprovedAid {
  const doc = r.content_documents;
  return {
    id: r.id,
    document_id: r.document_id,
    title: r.title,
    kind: r.kind,
    decision: r.decision ?? "",
    text: renderAid({ title: r.title, kind: r.kind, content: r.content }),
    source: doc?.title ?? "",
    reference: doc ? formatReference({ reference: doc.source_reference, year: doc.source_year }) : "",
  };
}

/** The approved aids with these ids (any not approved are left out). */
export async function getApprovedAids(ids: number[]): Promise<ApprovedAid[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("decision_aids")
    .select("id,document_id,title,kind,decision,applies_to,content,content_documents(title,source_reference,source_year)")
    .in("id", ids)
    .eq("status", "approved");
  if (error) return [];
  const byId = new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, toAid(r)]));
  return ids.map((id) => byId.get(id)).filter((a): a is ApprovedAid => Boolean(a));
}

/** Room for aids in a generation prompt: a large flowchart runs to 4,000 characters. */
const GENERATION_AID_CHARS = 10000;

/**
 * Every approved aid drawn from these documents, for question generation:
 * the first document's first (the caller lists the documents a question
 * draws on most first), each document's in page order.
 */
export async function approvedAidsForDocuments(documentIds: number[]): Promise<ApprovedAid[]> {
  if (documentIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("decision_aids")
    .select("id,document_id,title,kind,decision,applies_to,page,content,content_documents(title,source_reference,source_year)")
    .in("document_id", documentIds)
    .eq("status", "approved")
    .order("page");
  if (error) return [];
  const rank = (id: number) => documentIds.indexOf(id);
  return ((data ?? []) as unknown as Row[]).sort((a, b) => rank(a.document_id) - rank(b.document_id)).map(toAid);
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z][a-z-]{5,}/g) ?? []);
/** Below this share of its words in the passages, an aid is about something
 *  else. A rough measure: clinical words are shared widely, and passages
 *  from an unrelated guideline share a third to two thirds of an aid's. */
const MIN_SHARE = 0.5;

/**
 * The aids a question's passages bear on most, within a size the prompt
 * can carry. Page order was not enough: GTG 37a's first three tables
 * went to every question, and its risk-assessment chart, the one that
 * decides management, to none. An aid a question can use is one whose
 * words its passages share, since a point is tested only where a
 * passage states it too.
 */
export function aidsForPassages(aids: ApprovedAid[], passages: string[], limit = 3): ApprovedAid[] {
  const have = words(passages.join(" "));
  const share = (aid: ApprovedAid) => {
    const own = words(aid.text);
    let found = 0;
    for (const w of own) if (have.has(w)) found++;
    return own.size ? found / own.size : 0;
  };
  const ranked = aids.map((aid) => ({ aid, score: share(aid) })).sort((a, b) => b.score - a.score);
  const out: ApprovedAid[] = [];
  let chars = 0;
  for (const { aid, score } of ranked) {
    if (out.length >= limit || score < MIN_SHARE) break;
    if (chars + aid.text.length > GENERATION_AID_CHARS) continue;
    chars += aid.text.length;
    out.push(aid);
  }
  return out;
}

/**
 * Aids as a question writer reads them. No [aid:N] markers: a question
 * cites passages only, so nothing here invites a citation it cannot store.
 */
export function formatAidsForGeneration(aids: ApprovedAid[]): string {
  return aids
    .map((a) => `DECISION AID (from ${a.source}${a.reference ? `, ${a.reference}` : ""})\n${a.text}`)
    .join("\n\n");
}

/** Aids as the model reads them, each under its own [aid:N] marker. */
export function formatAids(aids: ApprovedAid[]): string {
  return aids
    .map((a) => `[aid:${a.id}] (Decision aid from: ${a.source}${a.reference ? `, ${a.reference}` : ""})\n${a.text}`)
    .join("\n\n");
}
