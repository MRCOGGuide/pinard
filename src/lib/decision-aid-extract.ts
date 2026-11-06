import "server-only";
import { PDFDocument, degrees } from "pdf-lib";
import { getDocumentProxy } from "unpdf";
import type Anthropic from "@anthropic-ai/sdk";
import { aidsFastModel, aidsReadModel, claudeClient } from "@/lib/anthropic";
import { isReferenceList } from "@/lib/bibliography";
import { markSearched } from "@/lib/decision-aid-searched";
import type { AidContent, AidKind } from "@/lib/decision-aid-shape";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Finding the decision aids in a guideline from inside the app (owner,
 * 4 November 2026: when a source is uploaded, its flowcharts and tables
 * should be found without a developer running a script).
 *
 * The prompts are the ones that read the library
 * (scripts/build-decision-aids.mts imports them from here). The script
 * draws each page with Windows' PDF engine, which the host does not
 * have; here the page is cut out of the PDF itself, turned upright and
 * cropped, and the model reads that. The same cut-out is what the owner
 * checks the transcription against in Admin.
 *
 * A guideline takes minutes and a function has a time limit, so a search
 * runs as short steps (one page read, or one aid transcribed), as many to
 * a run as fit, with its progress in a small file in Storage. That file
 * is what lets the next run, or a search that stopped, carry on from
 * where it was. Runs are started from outside: see lib/queue-run.
 */

// ---------- which documents ----------

/** Sections with no guidelines in them. */
const SECTIONS_WITHOUT_AIDS = new Set([35, 40, 30]);

/**
 * Worth searching without being asked: guidelines, not TOG review
 * articles, patient leaflets, summaries or correction notices (a summary
 * repeats the main document's tables and charts).
 */
export function guidelineWithAids(doc: { title: string; source_reference: string | null; tog_year?: number | null; section_id?: number | null }): boolean {
  const named = `${doc.title} ${doc.source_reference}`;
  if (doc.tog_year || SECTIONS_WITHOUT_AIDS.has(doc.section_id ?? 0)) return false;
  if (!/GTG|Green-top|NICE|BSH|BCSH|BHIVA|BASHH|guideline|Scientific Impact|SIP|FSRH|UKMEC|BMS|BSGE|BGCS|ESC|NHS Scotland|Good Practice|Consent Advice|RCOG/i.test(named)) return false;
  return !/^(Summary of|Correction)|Summary$|patient information|information for (you|parents|women)|errat|^Developing a Green-top|^Development of RCOG Green-top|dhpc-letter|[^A-Za-z]PIL([^A-Za-z]|$)/i.test(`${doc.title.trim()} | ${doc.source_reference ?? ""}`);
}

// ---------- which pages ----------

/** picture: little or no text layer, so wording cannot be checked against it. */
export type PageInfo = { n: number; text: string; turns: number; picture: boolean };

export async function readPages(bytes: Uint8Array): Promise<PageInfo[]> {
  // pdf.js takes the buffer it is given, so it gets its own copy.
  const pdf = await getDocumentProxy(bytes.slice());
  const pages: PageInfo[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const tally = new Map<number, number>();
    let text = "";
    let lastY: number | null = null;
    for (const it of tc.items as { str?: string; transform: number[] }[]) {
      if (typeof it.str !== "string") continue;
      const [a, b, , , , y] = it.transform;
      if (it.str.trim()) {
        const deg = ((Math.round((Math.atan2(b, a) * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;
        tally.set(deg, (tally.get(deg) ?? 0) + it.str.length);
      }
      text += (lastY !== null && Math.abs(y - lastY) > 2 ? "\n" : " ") + it.str;
      lastY = y;
    }
    const dominant = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;
    /* A page that is mostly a picture says nothing about its own
       orientation through its text: GTG 69's appendix algorithms are
       pictures, and the only text on them is the publisher's vertical
       download stamp, which turned them the wrong way. Such a page is
       left as it is, and the finder turns it upright from the image. */
    const textChars = [...tally.values()].reduce((x, y) => x + y, 0);
    const turns = textChars < 800 ? 0 : (((dominant - (page.rotate ?? 0)) / 90) % 4 + 4) % 4;
    pages.push({ n, text, turns, picture: textChars < 800 });
  }
  return pages;
}

export function candidatePages(pages: PageInfo[]): number[] {
  const out = new Set<number>();
  let inAppendix = false;
  /* The appendices are at the back: after the reference list, or failing
     one, in the last 40% of the document. A line in the text that merely
     begins "Appendix III summarises..." (GTG 37a, GTG 69) must not turn
     every following page into a candidate. */
  const refs = pages.filter((p) => p.n > pages.length * 0.4 && isReferenceList(p.text)).map((p) => p.n);
  const backStart = refs.length ? Math.min(...refs) : Math.ceil(pages.length * 0.6);
  for (const p of pages) {
    const lines = p.text.split("\n").map((l) => l.trim()).filter((l) => l && l.length <= 120);
    if (isReferenceList(p.text)) continue;
    // BJOG's layout spaces headings out letter by letter ("A PPE N DI X 1", GTG 17): read without the spaces too.
    const squashed = lines.map((l) => l.replace(/\s+/g, ""));
    if (p.n >= backStart && (lines.some((l) => /^(Appendix|Annex)\s*[A-Z0-9IVX]+[\s.:]/i.test(l)) || squashed.some((l) => /^(APPENDIX|ANNEX)([0-9]+|[IVX]+)/.test(l)))) inAppendix = true;
    /* A numbered caption (Table 1, Figure 2, Box 3, Appendix IV), the
       appendices (where the owner says the important charts and tables
       are), a sideways page, or a page that is mostly a picture. Pages
       that merely look like tables are not read: in RCOG's newer layout
       every section ends in a table of graded recommendations (GTG 69),
       and those are the text, not a decision aid. */
    const caption =
      lines.some((l) => /^(Appendix|Annex|Table|Box|Figure|Algorithm|Flow ?chart|Flow diagram|Chart|Pathway)\s*([0-9]+|[IVX]+|[A-Z])\b[\s.:]?/i.test(l) || /^(Algorithm|Flow ?chart|Flow diagram)\b/i.test(l)) ||
      squashed.some((l) => /^(APPENDIX|ANNEX|TABLE|BOX|FIGURE)([0-9]+|[IVX]+)/.test(l));
    if (caption || inAppendix || p.turns !== 0 || p.picture) out.add(p.n);
  }
  return [...out].sort((a, b) => a - b);
}

// ---------- 1. what is on the page ----------

export const LAYOUT_TOOL = {
  name: "list_aids",
  description: "List the decision aids on this page.",
  input_schema: {
    type: "object" as const,
    properties: {
      turns: { type: "integer", description: "Quarter-turns clockwise (0, 1, 2 or 3) needed to make the page's main content read upright. 0 if it already does." },
      aids: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Its title as printed, or a short description if it has none." },
            kind: { type: "string", enum: ["flowchart", "table", "box"] },
            box: { type: "array", items: { type: "number" }, description: "[left, top, right, bottom] as fractions (0 to 1) of the image's width and height, covering the whole aid with its title, key and footnotes." },
            continues_from_previous_page: { type: "boolean" },
            continues_on_next_page: { type: "boolean" },
          },
          required: ["title", "kind", "box", "continues_from_previous_page", "continues_on_next_page"],
        },
      },
    },
    required: ["turns", "aids"],
  },
};
export const LAYOUT_PROMPT = `You look at one page of a clinical guideline and list its DECISION AIDS: a flowchart, algorithm or decision tree, or a table that a clinician uses to reach a decision: who qualifies for a treatment (e.g. risk factors and who takes aspirin), a risk assessment and what each level leads to, a score and its actions, thresholds and the action at each, doses by weight or by line of treatment, timings, investigation or management pathways, care by gestation, criteria for admission or referral.
Be strict: most pages have none. Leave out:
- recommendation boxes, and tables whose rows are the guideline's recommendations with their grade, strength or evidence quality (as at the end of each section in RCOG's newer layout), key questions and section headings, and ordinary text, even when set in a box;
- tables that summarise evidence, studies or adverse effects reported in studies, reference lists, grades or levels of evidence, audit standards, contents, logos and contact details.
A chart or algorithm is ONE aid however many boxes and panels it has: never list a box or panel inside it separately. Only a chart made of separate parts with their own headings that no arrow connects (e.g. an antenatal half and a postnatal half side by side) is listed as one aid per part, each titled with the chart's title and the part's heading.
First say how many quarter-turns clockwise the page needs to read upright (pages are sometimes printed sideways), and give positions as on the page as you see it now.
A chart made of separate parts that do not connect (e.g. an antenatal half and a postnatal half side by side) is listed as one aid per part, each titled with the chart's title and the part's heading, so each part can be read large.
Give each one's position on the page as fractions of the image, generously covering its title, every box and arrow, its key and footnotes. If the page has none, return an empty list.`;

export const PARTS_TOOL = {
  name: "list_parts",
  description: "List the separate parts of the chart.",
  input_schema: {
    type: "object" as const,
    properties: {
      parts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string", description: "The part's own heading as printed, e.g. 'Antenatal assessment and management'." },
            box: { type: "array", items: { type: "number" }, description: "[left, top, right, bottom] as fractions of the image, covering every box and arrow of this part." },
          },
          required: ["heading", "box"],
        },
      },
    },
    required: ["parts"],
  },
};
export const PARTS_PROMPT = `This page holds a chart. Does it consist of separate parts that no arrow connects, each with its own heading (for example an antenatal chart and a postnatal chart side by side, divided by a line)? If so, list each part with its heading and its position. If it is one connected chart, return a single part covering it. Shared keys and abbreviations are not a part.`;

// ---------- 2. transcription ----------

const NODE = { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: ["start", "question", "action", "outcome", "note"] } }, required: ["id", "text", "kind"] };
export const AID_TOOL = {
  name: "record_aid",
  description: "Record the decision aid exactly as drawn.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Title verbatim, e.g. 'Appendix I: Obstetric thromboprophylaxis risk assessment and management'." },
      kind: { type: "string", enum: ["flowchart", "table", "box"] },
      decision: { type: "string", description: "The clinical decision it guides, in one plain line." },
      applies_to: { type: "array", items: { type: "string" }, description: "The conditions, risk factors or presentations that call for it, in plain words." },
      nodes: { type: "array", items: NODE, description: "Flowchart: every box, its text verbatim. A box listing several items is ONE node with all its items." },
      edges: { type: "array", items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, label: { type: "string" } }, required: ["from", "to"] }, description: "Flowchart: every arrow from the box it leaves to the box it points at, with its label verbatim if it has one." },
      columns: { type: "array", items: { type: "string" } },
      rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Table or box: every row, cells verbatim; a merged cell repeated in each row it spans." },
      footnotes: { type: "array", items: { type: "string" }, description: "Keys, footnotes and abbreviations printed with it, verbatim." },
    },
    required: ["title", "kind", "decision", "applies_to"],
  },
};
export const AID_PROMPT = `You transcribe one decision aid from a clinical guideline so an assistant can follow it exactly as a clinician would. A wrong arrow sends a woman down the wrong pathway, so take care over structure.

First study the drawing: which boxes are separate (look at their borders), and where each arrow starts and ends. A box that lists several items is one node; the arrow leaving it applies to all its items. Then transcribe:
- every word VERBATIM, symbols and units as printed (≥, <, x 10⁹/l, mg/kg); the page's text layer is given for exact wording, but the structure comes from the image;
- a flowchart: every box as a node, every arrow as an edge from the box at its tail to the box at its arrowhead. Words written beside an arrow are that edge's label, not a box. Where several arrows leave one box, each is its own edge from that box;
- a table: headings and every row; repeat a merged cell in each row it spans.
Leave out reference citation numbers (superscripts pointing to the reference list). Add nothing that is not on the page.`;

/**
 * A first row that repeats the column headings is dropped: 72 tables in
 * the first run did it, and the owner asked for each to be removed.
 */
export function withoutRepeatedHeadings(content: AidContent & { columns: string[]; rows: string[][] }) {
  const same = (x: string, y: string) => String(x ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, "") === String(y ?? "").toLowerCase().replace(/[^a-z0-9%]+/g, "");
  if (content.columns.length && content.rows[0]?.length === content.columns.length && content.rows[0].every((c, i) => same(c, content.columns[i]))) content.rows.shift();
  return content;
}

// ---------- cutting pages out of the PDF ----------

type Part = { page: number; box: number[] };

/** Copies one page and turns it upright. */
async function pageOf(src: PDFDocument, out: PDFDocument, n: number, turns: number) {
  const [page] = await out.copyPages(src, [n - 1]);
  if (turns) page.setRotation(degrees((page.getRotation().angle + turns * 90) % 360));
  out.addPage(page);
  return page;
}

/** The page as a one-page PDF of its own, upright. */
export async function cutPage(src: PDFDocument, n: number, turns: number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  await pageOf(src, out, n, turns);
  return out.save();
}

/**
 * The aid alone, so it is read large and the owner sees only what was
 * transcribed. Positions are fractions of the page as seen (upright,
 * top left first); the crop box is in the PDF's own coordinates, which
 * do not turn with the page.
 */
export async function cutParts(src: PDFDocument, parts: Part[], turnsOf: (page: number) => number): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const page = await pageOf(src, out, part.page, turnsOf(part.page));
    const { x, y, width: w, height: h } = page.getCropBox();
    const [l, t, r, b] = part.box;
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    const corners =
      angle === 90 ? [x + t * w, y + l * h, x + b * w, y + r * h]
      : angle === 180 ? [x + (1 - r) * w, y + t * h, x + (1 - l) * w, y + b * h]
      : angle === 270 ? [x + (1 - b) * w, y + (1 - r) * h, x + (1 - t) * w, y + (1 - l) * h]
      : [x + l * w, y + (1 - b) * h, x + r * w, y + (1 - t) * h];
    const [x0, y0, x1, y1] = corners;
    page.setMediaBox(x0, y0, x1 - x0, y1 - y0);
    page.setCropBox(x0, y0, x1 - x0, y1 - y0);
  }
  return out.save();
}

// ---------- the model ----------

/** USD per million tokens, in and out (Bedrock list prices), and the euro rate the pricing model uses. */
const PRICE: Record<string, [number, number]> = { opus: [5, 25], sonnet: [3, 15] };
export const USD_EUR = 1 / 1.1206;

export function costEur(model: string, usage: { input_tokens?: number | null; output_tokens?: number | null } | undefined): number {
  const [pin, pout] = PRICE[/opus/.test(model) ? "opus" : "sonnet"];
  return (((usage?.input_tokens ?? 0) * pin + (usage?.output_tokens ?? 0) * pout) / 1e6) * USD_EUR;
}

export const pdfBlock = (bytes: Uint8Array): Anthropic.DocumentBlockParam => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") },
});

type Tool = { name: string; description: string; input_schema: { type: "object"; properties: unknown } };

export async function ask<T>(model: string, system: string, content: Anthropic.ContentBlockParam[], tool: Tool, maxTokens: number): Promise<{ input: T; eur: number }> {
  const r = await claudeClient({ maxRetries: 1, timeout: 280000 }).messages.create({
    model, max_tokens: maxTokens, system, tools: [tool as Anthropic.Tool], tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content }],
  });
  const used = r.content.find((b) => b.type === "tool_use");
  return { input: (used?.type === "tool_use" ? used.input : {}) as T, eur: costEur(model, r.usage) };
}

// ---------- finding the aids on one page ----------

export type FoundAid = { title: string; kind: AidKind; parts: Part[]; next: boolean };
type Listed = { title?: string; kind?: string; box?: number[]; continues_from_previous_page?: boolean; continues_on_next_page?: boolean };

const padded = (box: number[]) => [Math.max(0, box[0] - 0.02), Math.max(0, box[1] - 0.02), Math.min(1, box[2] + 0.02), Math.min(1, box[3] + 0.02)];

/** Reads one page, adding what is on it to the aids found so far. Returns how far it had to turn the page. */
export async function readPage(src: PDFDocument, n: number, title: string, turns: number, found: FoundAid[]): Promise<{ turns: number; eur: number }> {
  const model = aidsReadModel();
  let eur = 0;
  const list = async (t: number, note: string) => {
    const r = await ask<{ turns?: number; aids?: Listed[] }>(model, LAYOUT_PROMPT, [pdfBlock(await cutPage(src, n, t)), { type: "text", text: `Page ${n} of ${title}.${note}` }], LAYOUT_TOOL, 1500);
    eur += r.eur;
    return r.input;
  };
  /* Opus finds the aids: Sonnet listed 55 on GTG 69 (fragments of single
     charts, recommendation boxes), and transcribing false finds cost
     more than the stronger finder does. A page found to be sideways is
     turned upright and looked at again. */
  let listed = await list(turns, "");
  const extra = Number(listed.turns ?? 0);
  if ([1, 2, 3].includes(extra) && (listed.aids ?? []).length > 0) {
    turns = (turns + extra) % 4;
    listed = await list(turns, " It has been turned upright.");
  }
  const onPage: FoundAid[] = [];
  for (const a of listed.aids ?? []) {
    const box = Array.isArray(a.box) && a.box.length === 4 ? padded(a.box.map(Number)) : [0, 0, 1, 1];
    const prev = found[found.length - 1];
    // A part continued from the page before joins its aid.
    if (a.continues_from_previous_page && prev?.next && prev.parts[prev.parts.length - 1].page === n - 1) {
      prev.parts.push({ page: n, box });
      prev.next = Boolean(a.continues_on_next_page);
      continue;
    }
    onPage.push({ title: String(a.title ?? ""), kind: (["flowchart", "table", "box"].includes(String(a.kind)) ? a.kind : "table") as AidKind, parts: [{ page: n, box }], next: Boolean(a.continues_on_next_page) });
  }
  /* A large chart is asked once more whether it is really one chart:
     GTG 37a's Appendix I is an antenatal and a postnatal chart side by
     side, came back as one whole-page aid despite the instruction, and
     read whole it was misgrouped; read one part at a time it was not. */
  const charts = onPage.filter((f) => f.kind === "flowchart");
  const b = charts[0]?.parts[0].box;
  if (charts.length === 1 && (b[2] - b[0]) * (b[3] - b[1]) >= 0.35) {
    const r = await ask<{ parts?: { heading?: string; box?: number[] }[] }>(model, PARTS_PROMPT, [pdfBlock(await cutPage(src, n, turns)), { type: "text", text: `The chart: ${charts[0].title}.` }], PARTS_TOOL, 1000);
    eur += r.eur;
    const parts = (r.input.parts ?? []).filter((p) => Array.isArray(p.box) && p.box.length === 4);
    if (parts.length >= 2) {
      onPage.splice(onPage.indexOf(charts[0]), 1, ...parts.map((p) => ({
        title: `${charts[0].title}: ${String(p.heading ?? "").trim()}`.replace(/:\s*$/, ""),
        kind: "flowchart" as AidKind,
        parts: [{ page: n, box: padded(p.box!.map(Number)) }],
        next: false,
      })));
    }
  }
  found.push(...onPage);
  return { turns, eur };
}

// ---------- transcribing one ----------

export type Transcribed = { title: string; kind: AidKind; decision: string; applies_to: string[]; content: AidContent };
type Recorded = { title?: string; kind?: string; decision?: string; applies_to?: string[]; nodes?: AidContent["nodes"]; edges?: AidContent["edges"]; columns?: string[]; rows?: string[][]; footnotes?: string[] };

export async function transcribe(src: PDFDocument, f: FoundAid, documentName: string, turnsOf: (page: number) => number): Promise<{ aid: Transcribed; pdf: Uint8Array; eur: number }> {
  /* Tested on GTG 37a, Sonnet 4.5 found every page Opus did and
     transcribed its tables with 86 to 100% of cells identical; every
     structural error seen was in a flowchart. So Sonnet reads tables and
     boxes, and Opus reads flowcharts. */
  const model = f.kind === "flowchart" ? aidsReadModel() : aidsFastModel();
  const pdf = await cutParts(src, f.parts, turnsOf);
  const texts: string[] = [];
  for (const p of f.parts) texts.push((await readPages(await cutPage(src, p.page, 0)))[0]?.text ?? "");
  const r = await ask<Recorded>(model, AID_PROMPT, [
    pdfBlock(pdf),
    { type: "text", text: `${f.parts.length > 1 ? "These pages are one aid continued across pages, in order. " : ""}Guideline: ${documentName}, page ${f.parts[0].page}.\n\nTHE PAGE'S TEXT LAYER (wording only; take the structure from the image):\n${texts.join("\n").slice(0, 6000)}` },
  ], AID_TOOL, 12000);
  const t = r.input;
  const content = withoutRepeatedHeadings({ nodes: t.nodes ?? [], edges: t.edges ?? [], columns: t.columns ?? [], rows: t.rows ?? [], footnotes: t.footnotes ?? [] });
  return {
    aid: {
      title: String(t.title ?? f.title),
      kind: (["flowchart", "table", "box"].includes(String(t.kind)) ? t.kind : f.kind) as AidKind,
      decision: String(t.decision ?? ""),
      applies_to: Array.isArray(t.applies_to) ? t.applies_to.map(String) : [],
      content,
    },
    pdf,
    eur: r.eur,
  };
}

// ---------- a search, one step at a time ----------

export type AidSearch = {
  state: "running" | "done" | "stopped";
  /** The pages worth reading, in order, and how many have been read. */
  pages: number[];
  read: number;
  /** Quarter-turns each page needs, by page number. */
  turns: Record<string, number>;
  found: FoundAid[];
  /** How many of found have been transcribed and saved as drafts. */
  saved: number;
  eur: number;
  message?: string;
  updated_at: string;
};

/** A search is stopped here, to be carried on by hand: the most a guideline cost in the library's run was EUR 2. */
const SEARCH_LIMIT_EUR = 6;
/** Nothing for this long means cut off: runs are minutes apart, and the workflow can run late. */
export const STALLED_MS = 20 * 60 * 1000;
/** How long one run keeps taking steps. The route is allowed 300 seconds, and a step may take a minute or more. */
export const STEPS_BUDGET_MS = 200_000;
/** Progress this recent means a run is working on it. */
export const justWorkedOn = (updatedAt: string) => Date.now() - Date.parse(updatedAt) < 2 * 60 * 1000;

const searchFile = (documentId: number) => `aids/${documentId}/search.json`;

export async function readSearch(documentId: number): Promise<AidSearch | null> {
  const { data } = await createAdminClient().storage.from("sources").download(searchFile(documentId));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as AidSearch;
  } catch {
    return null;
  }
}

export async function writeSearch(documentId: number, search: AidSearch): Promise<void> {
  search.updated_at = new Date().toISOString();
  const { error } = await createAdminClient().storage.from("sources").upload(searchFile(documentId), new Blob([JSON.stringify(search)], { type: "application/json" }), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Saving the search's progress failed: ${error.message}`);
  if (search.state === "done") await markSearched(documentId);
}

/** Starts a search for a source just ingested. False if it could not be started. */
export async function startSearchRun(origin: string, documentId: number): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const response = await fetch(`${origin}/api/decision-aids/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ documentId }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

type SearchedDocument = { id: number; title: string; source_reference: string | null; file_url: string };

async function storedPdf(doc: SearchedDocument): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from("sources").download(doc.file_url);
  if (error || !data) throw new Error(`The stored file could not be read (${error?.message})`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Chooses the pages to read. */
export async function startSearch(doc: SearchedDocument): Promise<AidSearch> {
  const pages = await readPages(await storedPdf(doc));
  const chosen = candidatePages(pages);
  return {
    state: chosen.length ? "running" : "done",
    pages: chosen,
    read: 0,
    turns: Object.fromEntries(pages.filter((p) => p.turns).map((p) => [String(p.n), p.turns])),
    found: [],
    saved: 0,
    eur: 0,
    updated_at: new Date().toISOString(),
  };
}

/** Saves a transcribed aid as a draft. One the owner has reviewed is left alone. */
async function saveDraft(doc: SearchedDocument, position: number, page: number, t: Awaited<ReturnType<typeof transcribe>>): Promise<void> {
  const db = createAdminClient();
  const { data: prior } = await db.from("decision_aids").select("id,status").eq("document_id", doc.id).eq("page", page).eq("position", position).maybeSingle();
  if (prior && prior.status !== "draft") return;
  const key = `aids/${doc.id}/aid-${page}-${position}.pdf`;
  const up = await db.storage.from("sources").upload(key, new Blob([t.pdf as BlobPart], { type: "application/pdf" }), { upsert: true, contentType: "application/pdf" });
  if (up.error) throw new Error(`${key}: ${up.error.message}`);
  const row = {
    document_id: doc.id, page, position, title: t.aid.title, kind: t.aid.kind, decision: t.aid.decision,
    applies_to: t.aid.applies_to, content: t.aid.content, flags: [], image_paths: [key], status: "draft",
    extracted_by: `${aidsFastModel()} (tables) / ${aidsReadModel()} (finding, flowcharts)`, updated_at: new Date().toISOString(),
  };
  const { error } = prior ? await db.from("decision_aids").update(row).eq("id", prior.id) : await db.from("decision_aids").insert(row);
  if (error) throw new Error(`Saving the aid on page ${page} failed: ${error.message}`);
}

/** One step: reads the next page, or transcribes the next aid. The search says what it did and whether more remains. */
export async function stepSearch(doc: SearchedDocument, search: AidSearch): Promise<void> {
  const name = `${doc.title} (${doc.source_reference})`;
  try {
    if (search.eur >= SEARCH_LIMIT_EUR) {
      search.state = "stopped";
      search.message = `Stopped at EUR ${search.eur.toFixed(2)}, the limit for one source. Press Find decision aids to carry on.`;
      return;
    }
    const src = await PDFDocument.load(await storedPdf(doc), { ignoreEncryption: true });
    if (search.read < search.pages.length) {
      const n = search.pages[search.read];
      const r = await readPage(src, n, name, search.turns[n] ?? 0, search.found);
      if (r.turns) search.turns[n] = r.turns;
      search.read += 1;
      search.eur += r.eur;
    } else if (search.saved < search.found.length) {
      const f = search.found[search.saved];
      const page = f.parts[0].page;
      const position = search.found.slice(0, search.saved).filter((x) => x.parts[0].page === page).length + 1;
      const t = await transcribe(src, f, name, (p) => search.turns[p] ?? 0);
      await saveDraft(doc, position, page, t);
      search.saved += 1;
      search.eur += t.eur;
    }
    delete search.message;
    if (search.read >= search.pages.length && search.saved >= search.found.length) search.state = "done";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    search.state = "stopped";
    search.message = /too many tokens|throttl|quota|rate.?limit|429/i.test(message)
      ? "The model's daily limit was reached. Press Find decision aids later to carry on."
      : `Stopped: ${message.slice(0, 200)}. Press Find decision aids to carry on.`;
  }
}
