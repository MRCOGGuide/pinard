/**
 * The shape of a pathway record and the names its fields are shown
 * under. Types and labels only, so client components can import it
 * without pulling in the checks (src/lib/pathways.ts).
 */

export type PathwayArea = "obstetric" | "medical" | "gynaecology";
export type PathwayStatus = "draft" | "approved" | "needs_changes" | "not_in_sources";

/** One statement, with where it came from. */
export type PathwayItem = {
  /** When it applies, if the source ties it to a time ("from 12 weeks", "at 28 weeks"). */
  when?: string;
  text: string;
  /** The passages it was read from. */
  chunks: number[];
  /** The heading or recommendation number as the source prints it, if given. */
  where?: string;
};

export type PathwayConflict = {
  topic: string;
  positions: { text: string; chunks: number[] }[];
  /** The position the owner chose; until then the point stays out of answers. */
  chosen?: number | null;
};

export type PathwayBody = {
  applies_when: PathwayItem[];
  maternal_risks: PathwayItem[];
  fetal_risks: PathwayItem[];
  /** Medical conditions: the condition's effect on the pregnancy... */
  condition_on_pregnancy: PathwayItem[];
  /** ...and the pregnancy's effect on the condition. */
  pregnancy_on_condition: PathwayItem[];
  preconception: PathwayItem[];
  booking: PathwayItem[];
  antenatal: PathwayItem[];
  delivery: PathwayItem[];
  intrapartum: PathwayItem[];
  postpartum: PathwayItem[];
  drugs: PathwayItem[];
  escalation: PathwayItem[];
};

/** The fields in the order a pathway is read, with the owner-facing names. */
export const PATHWAY_FIELDS: { key: keyof PathwayBody; label: string }[] = [
  { key: "applies_when", label: "When it applies" },
  { key: "maternal_risks", label: "Risks to the mother" },
  { key: "fetal_risks", label: "Risks to the baby" },
  { key: "condition_on_pregnancy", label: "Effect of the condition on the pregnancy" },
  { key: "pregnancy_on_condition", label: "Effect of pregnancy on the condition" },
  { key: "preconception", label: "Preconception" },
  { key: "booking", label: "Booking" },
  { key: "antenatal", label: "Antenatal" },
  { key: "delivery", label: "Timing and mode of delivery" },
  { key: "intrapartum", label: "Intrapartum" },
  { key: "postpartum", label: "Postpartum" },
  { key: "drugs", label: "Drugs and doses" },
  { key: "escalation", label: "When to refer or escalate" },
];

export type PathwayRecord = {
  slug: string;
  name: string;
  area: PathwayArea;
  status: PathwayStatus;
  /** Plain words the live answer matches a woman's risk factors against. */
  triggers: string[];
  body: PathwayBody;
  /** What the sources leave out, in the owner's words to act on. */
  gaps: string[];
  conflicts: PathwayConflict[];
  source_document_ids: number[];
  /** What the checks removed, and why: shown to the owner beside the draft. */
  removed: string[];
  extracted_by: string;
};

export function emptyBody(): PathwayBody {
  return Object.fromEntries(PATHWAY_FIELDS.map((f) => [f.key, []])) as unknown as PathwayBody;
}

/** Every chunk id a body or its conflicts cite. */
export function citedChunks(body: PathwayBody, conflicts: PathwayConflict[] = []): number[] {
  const ids = new Set<number>();
  for (const { key } of PATHWAY_FIELDS) for (const item of body[key]) item.chunks.forEach((id) => ids.add(id));
  for (const c of conflicts) for (const p of c.positions) p.chunks.forEach((id) => ids.add(id));
  return [...ids];
}

export function itemCount(body: PathwayBody): number {
  return PATHWAY_FIELDS.reduce((n, { key }) => n + body[key].length, 0);
}
