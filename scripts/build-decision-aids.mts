/**
 * Draws the decision aids (flowcharts, algorithms, decision tables) out
 * of the guidelines (owner's direction, 12 October 2026).
 *
 *   npx tsx --conditions=react-server scripts/build-decision-aids.mts 54 47 37   # chosen documents
 *   npx tsx --conditions=react-server scripts/build-decision-aids.mts --all      # every guideline not yet done
 *   npx tsx --conditions=react-server scripts/build-decision-aids.mts --load     # into decision_aids (phase 51)
 *
 * For each guideline:
 *   1. pages that may hold an aid are found from their text: a caption
 *      (Table, Box, Figure, Algorithm, Appendix...), a page of short
 *      layout lines, or any page in the appendices;
 *   2. each is rendered sharply by Windows' own PDF engine and turned
 *      upright: GTG 37a's VTE chart is printed sideways, and read
 *      sideways it was misgrouped by every model tried;
 *   3. Opus 4.5 finds each aid on the page, which is cropped out, so the
 *      boxes and arrows are read large, then transcribed verbatim with its
 *      structure (boxes and arrows, or rows);
 *   4. three checks, each recorded as a flag for the owner, never a
 *      silent fix: every word is looked for in the page's own text; a
 *      second look compares the transcription with the image; and the
 *      guideline's written recommendations are read for contradictions.
 *
 * Opus 4.5 and Sonnet 4.5 have their own Bedrock quotas, so a build never
 * spends what live Ask Pinard answers use. On a quota error the run stops;
 * run it again later and it carries on. Output: scripts/_decision_aids/
 * (git-ignored: the repository is public and transcriptions are the
 * guidance's own words) and the crops in scripts/_aid_pages/.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { claudeClient } = await import("../src/lib/anthropic");
const { embedTexts } = await import("../src/lib/voyage");
const { isReferenceList } = await import("../src/lib/bibliography");
const { renderAid } = await import("../src/lib/decision-aid-shape");
const { getDocumentProxy } = await import("unpdf");
type DecisionAid = import("../src/lib/decision-aid-shape").DecisionAid;

const READ_MODEL = process.env.AIDS_MODEL ?? "global.anthropic.claude-opus-4-5-20251101-v1:0";
const TEXT_MODEL = process.env.AIDS_TEXT_MODEL ?? "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
const PDF_DIR = "scripts/_pdfs";
const PAGE_DIR = "scripts/_aid_pages";
const OUT_DIR = "scripts/_decision_aids";
const RENDER_WIDTH = 2400;
for (const d of [PDF_DIR, PAGE_DIR, OUT_DIR]) fs.mkdirSync(d, { recursive: true });

const db = createAdminClient();
const client = claudeClient({ maxRetries: 2, timeout: 600000 });
const usage = { input: 0, output: 0 };

// ---------- which documents ----------
/** Guidelines, not TOG review articles, patient leaflets or learning reports. */
async function guidelineIds(): Promise<number[]> {
  const docs: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("content_documents").select("id,section_id,title,source_reference,tog_year").range(f, f + 999);
    docs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const skipSections = new Set([35, 40, 30]);
  const duplicates = new Set([1012, 5, 7]);
  return docs
    .filter((d) => !d.tog_year && !skipSections.has(d.section_id) && !duplicates.has(d.id))
    .filter((d) => /GTG|Green-top|NICE|BSH|BCSH|BHIVA|BASHH|guideline|Scientific Impact|SIP|FSRH|UKMEC|BMS|BSGE|BGCS|ESC|NHS Scotland|Good Practice|Consent Advice|RCOG/i.test(`${d.title} ${d.source_reference}`))
    .map((d) => d.id)
    .sort((a, b) => a - b);
}

// ---------- pages ----------
type PageInfo = { n: number; text: string; turns: number };

async function readPages(file: string): Promise<PageInfo[]> {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const pages: PageInfo[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const tally = new Map<number, number>();
    let text = "";
    let lastY: number | null = null;
    for (const it of tc.items as any[]) {
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
    const turns = (((dominant - (page.rotate ?? 0)) / 90) % 4 + 4) % 4;
    pages.push({ n, text, turns });
  }
  return pages;
}

function candidatePages(pages: PageInfo[]): number[] {
  const out = new Set<number>();
  let inAppendix = false;
  for (const p of pages) {
    const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (isReferenceList(p.text)) continue;
    if (lines.some((l) => /^(Appendix|Annex)\s*[A-Z0-9IVX]*[\s.:]/i.test(l))) inAppendix = true;
    const caption = lines.some((l) => /^(Appendix|Annex|Table|Box|Figure|Algorithm|Flow ?chart|Flow diagram|Chart|Pathway)\s*[A-Z0-9IVX]*[\s.:]/i.test(l));
    const short = lines.filter((l) => l.length < 45).length;
    const layout = lines.length >= 20 && short / lines.length > 0.6;
    if (caption || layout || inAppendix || p.turns !== 0) out.add(p.n);
  }
  return [...out].sort((a, b) => a - b);
}

function render(pdf: string, dir: string, pages: PageInfo[]) {
  const todo = pages.filter((p) => !fs.existsSync(path.join(dir, `p${p.n}.png`)));
  if (todo.length === 0) return;
  execFileSync("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/render-pdf-pages.ps1",
    "-Pdf", pdf, "-OutDir", dir, "-Pages", todo.map((p) => `${p.n}:${p.turns}`).join(","), "-Width", String(RENDER_WIDTH),
  ], { stdio: "pipe" });
}

function crop(specs: { in: string; out: string; box: number[] }[]) {
  if (specs.length === 0) return;
  const spec = path.join(PAGE_DIR, "_crops.json");
  fs.writeFileSync(spec, JSON.stringify(specs));
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/crop-images.ps1", "-Spec", spec], { stdio: "pipe" });
}

const png = (file: string) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: fs.readFileSync(file).toString("base64") } });

async function call(model: string, system: string, content: any[], tool: any, maxTokens: number): Promise<any> {
  const r = await client.messages.create({
    model, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content }],
  });
  usage.input += r.usage?.input_tokens ?? 0;
  usage.output += r.usage?.output_tokens ?? 0;
  const t = r.content.find((b: any) => b.type === "tool_use") as any;
  return t?.input ?? {};
}

// ---------- 1. what is on the page ----------
const LAYOUT_TOOL = {
  name: "list_aids",
  description: "List the decision aids on this page.",
  input_schema: {
    type: "object" as const,
    properties: {
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
    required: ["aids"],
  },
};
const LAYOUT_PROMPT = `You look at one page of a clinical guideline and list its DECISION AIDS: any flowchart, algorithm, decision tree, or table or box that guides a clinical decision (who qualifies for a treatment, risk factors and what they lead to, a risk score and its actions, thresholds and the action at each, doses by weight, timings, investigation or management pathways, care by gestation, criteria for referral).
Leave out: tables that only summarise evidence or study results, reference lists, grades of recommendation or evidence levels, audit standards, contents, and ordinary paragraphs of text.
A chart made of separate parts that do not connect (e.g. an antenatal half and a postnatal half side by side) is listed as one aid per part, each titled with the chart's title and the part's heading, so each part can be read large.
Give each one's position on the page as fractions of the image, generously covering its title, every box and arrow, its key and footnotes. If the page has none, return an empty list.`;

const PARTS_TOOL = {
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
const PARTS_PROMPT = `This page holds a chart. Does it consist of separate parts that no arrow connects, each with its own heading (for example an antenatal chart and a postnatal chart side by side, divided by a line)? If so, list each part with its heading and its position. If it is one connected chart, return a single part covering it. Shared keys and abbreviations are not a part.`;

// ---------- 2. transcription ----------
const NODE = { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, kind: { type: "string", enum: ["start", "question", "action", "outcome", "note"] } }, required: ["id", "text", "kind"] };
const AID_TOOL = {
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
const AID_PROMPT = `You transcribe one decision aid from a clinical guideline so an assistant can follow it exactly as a clinician would. A wrong arrow sends a woman down the wrong pathway, so take care over structure.

First study the drawing: which boxes are separate (look at their borders), and where each arrow starts and ends. A box that lists several items is one node; the arrow leaving it applies to all its items. Then transcribe:
- every word VERBATIM, symbols and units as printed (≥, <, x 10⁹/l, mg/kg); the page's text layer is given for exact wording, but the structure comes from the image;
- a flowchart: every box as a node, every arrow as an edge from the box at its tail to the box at its arrowhead. Words written beside an arrow are that edge's label, not a box. Where several arrows leave one box, each is its own edge from that box;
- a table: headings and every row; repeat a merged cell in each row it spans.
Leave out reference citation numbers (superscripts pointing to the reference list). Add nothing that is not on the page.`;

// ---------- 3. checks ----------
const CHECK_TOOL = {
  name: "report_mismatches",
  description: "Report every way the transcription differs from the image.",
  input_schema: {
    type: "object" as const,
    properties: { mismatches: { type: "array", items: { type: "string" }, description: "One plain line each: what the transcription says, and what the image shows." } },
    required: ["mismatches"],
  },
};
const CHECK_PROMPT = `You check a transcription of a clinical flowchart or table against the image it came from. Trace every arrow and every row yourself on the image, then compare. Report each difference that would change a decision: an item in the wrong box, an arrow to the wrong box, a missing or extra box, arrow, row or cell, a changed number, threshold or word. Ignore differences of layout or line breaks only. An empty list means it matches.`;

const TEXT_TOOL = {
  name: "report_contradictions",
  description: "Report each part of the transcription the guideline's text contradicts.",
  input_schema: {
    type: "object" as const,
    properties: { contradictions: { type: "array", items: { type: "string" }, description: "What the transcription says, the text that contradicts it (quoted), and what the text implies." } },
    required: ["contradictions"],
  },
};
const TEXT_PROMPT = `A decision aid was transcribed from a drawing in a clinical guideline, and the drawing may have been misread (an item in the wrong group, an arrow to the wrong box, a wrong threshold). You are given passages from the same guideline. Report a contradiction only where a passage states a DIFFERENT category, action, threshold, dose or timing for the same item, and quote that sentence. Agreement in other words is not a contradiction; nor is a passage that is more detailed, that says "consider" where the aid gives a category, or that does not mention the item. Most transcriptions have none: an empty list is the usual answer.`;

const flat = (s: string) => s.toLowerCase().replace(/([0-9])([a-z])/g, "$1 $2").replace(/([a-z])([0-9])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").trim();
function wordingFlags(content: any, pageText: string): string[] {
  const whole = flat(pageText);
  const words = new Set(whole.split(" "));
  const texts = [...(content.nodes ?? []).map((n: any) => n.text), ...(content.edges ?? []).map((e: any) => e.label ?? ""), ...(content.columns ?? []), ...(content.rows ?? []).flat(), ...(content.footnotes ?? [])];
  return texts.flatMap((s: string) => String(s ?? "").split(/\n|•/)).filter((s: string) => {
    const f = flat(s ?? "");
    if (f.length < 3 || whole.includes(f)) return false;
    const w = f.split(" ").filter((x) => x.length > 2 || /\d/.test(x));
    if (w.some((x) => /\d/.test(x) && !words.has(x))) return true;
    return w.length > 0 && w.filter((x) => words.has(x)).length / w.length < 0.85;
  });
}

const cosine = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y);
};

// ---------- one document ----------
async function buildDocument(id: number): Promise<void> {
  const started = Date.now();
  const before = { ...usage };
  const { data: doc } = await db.from("content_documents").select("id,title,source_reference,file_url").eq("id", id).single();
  if (!doc?.file_url) return console.log(`${id}: no stored PDF`);
  const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    const { data: blob, error } = await db.storage.from("sources").download(doc.file_url);
    if (error || !blob) return console.log(`${id}: download failed (${error?.message})`);
    fs.writeFileSync(pdfPath, new Uint8Array(await blob.arrayBuffer()));
  }
  const pages = await readPages(pdfPath);
  const chosen = candidatePages(pages);
  const dir = path.join(PAGE_DIR, String(id));
  fs.mkdirSync(dir, { recursive: true });
  render(pdfPath, dir, pages.filter((p) => chosen.includes(p.n)));

  // Find the aids, page by page; a part continued from the page before joins its aid.
  type Found = { page: number; title: string; kind: string; parts: { page: number; box: number[] }[]; next: boolean };
  const found: Found[] = [];
  for (const n of chosen) {
    const img = path.join(dir, `p${n}.png`);
    if (!fs.existsSync(img)) continue;
    const listed = await call(READ_MODEL, LAYOUT_PROMPT, [png(img), { type: "text", text: `Page ${n} of ${doc.title}.` }], LAYOUT_TOOL, 1500);
    for (const a of (listed.aids ?? []) as any[]) {
      const box = Array.isArray(a.box) && a.box.length === 4 ? a.box.map(Number) : [0, 0, 1, 1];
      const padded = [Math.max(0, box[0] - 0.02), Math.max(0, box[1] - 0.02), Math.min(1, box[2] + 0.02), Math.min(1, box[3] + 0.02)];
      const prev = found[found.length - 1];
      if (a.continues_from_previous_page && prev && prev.next && prev.parts[prev.parts.length - 1].page === n - 1) {
        prev.parts.push({ page: n, box: padded });
        prev.next = Boolean(a.continues_on_next_page);
        continue;
      }
      found.push({ page: n, title: String(a.title ?? ""), kind: String(a.kind ?? "table"), parts: [{ page: n, box: padded }], next: Boolean(a.continues_on_next_page) });
    }
  }

  /* A large chart is asked once more whether it is really one chart:
     GTG 37a's Appendix I is an antenatal and a postnatal chart side by
     side, came back as one whole-page aid despite the instruction, and
     read whole it was misgrouped; read one part at a time it was not. */
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    const b = f.parts[0].box;
    // Only when the page came back as one chart: one already divided is not divided again.
    const samePage = found.filter((x) => x.page === f.page && x.kind === "flowchart").length;
    if (f.kind !== "flowchart" || f.parts.length > 1 || samePage > 1 || (b[2] - b[0]) * (b[3] - b[1]) < 0.35) continue;
    const split = await call(READ_MODEL, PARTS_PROMPT, [png(path.join(dir, `p${f.page}.png`)), { type: "text", text: `The chart: ${f.title}.` }], PARTS_TOOL, 1000);
    const parts = ((split.parts ?? []) as any[]).filter((p) => Array.isArray(p.box) && p.box.length === 4);
    if (parts.length < 2) continue;
    found.splice(i, 1, ...parts.map((p) => {
      const pb = p.box.map(Number);
      return { page: f.page, title: `${f.title}: ${String(p.heading ?? "").trim()}`.replace(/:\s*$/, ""), kind: "flowchart", parts: [{ page: f.page, box: [Math.max(0, pb[0] - 0.02), Math.max(0, pb[1] - 0.02), Math.min(1, pb[2] + 0.02), Math.min(1, pb[3] + 0.02)] }], next: false };
    }));
    i += parts.length - 1;
  }

  // Crop each part out at full sharpness.
  const specs: { in: string; out: string; box: number[] }[] = [];
  found.forEach((f, i) => f.parts.forEach((p, j) => specs.push({ in: path.join(dir, `p${p.page}.png`), out: path.join(dir, `aid-${i + 1}-${j + 1}.png`), box: p.box })));
  crop(specs);

  // Guideline passages and their embeddings, for the text check.
  const { data: chunks } = await db.from("content_chunks").select("id,text,embedding").eq("document_id", id);
  const passages = (chunks ?? []).filter((c: any) => !isReferenceList(c.text)).map((c: any) => ({ text: c.text as string, e: (typeof c.embedding === "string" ? JSON.parse(c.embedding) : c.embedding) as number[] }));

  const aids: (DecisionAid & { crops: string[] })[] = [];
  for (let i = 0; i < found.length; i++) {
    const f = found[i];
    const crops = f.parts.map((_, j) => path.join(dir, `aid-${i + 1}-${j + 1}.png`)).filter((p) => fs.existsSync(p));
    if (crops.length === 0) continue;
    const pageText = f.parts.map((p) => pages[p.page - 1]?.text ?? "").join("\n");
    const images = crops.map(png);
    const t = await call(READ_MODEL, AID_PROMPT, [
      ...images,
      { type: "text", text: `${crops.length > 1 ? "These images are one aid continued across pages, in order. " : ""}Guideline: ${doc.title} (${doc.source_reference}), page ${f.page}.\n\nTHE PAGE'S TEXT LAYER (wording only; take the structure from the image):\n${pageText.slice(0, 12000)}` },
    ], AID_TOOL, 12000);
    const content = { nodes: t.nodes ?? [], edges: t.edges ?? [], columns: t.columns ?? [], rows: t.rows ?? [], footnotes: t.footnotes ?? [] };
    const aid = { document_id: id, page: f.page, position: aids.filter((a) => a.page === f.page).length + 1, title: String(t.title ?? f.title), kind: (["flowchart", "table", "box"].includes(t.kind) ? t.kind : f.kind) as DecisionAid["kind"], decision: String(t.decision ?? ""), applies_to: Array.isArray(t.applies_to) ? t.applies_to.map(String) : [], content, flags: [] as DecisionAid["flags"], crops };
    let rendered = renderAid(aid);

    for (const w of wordingFlags(aid.content, pageText)) aid.flags.push({ source: "wording", detail: `Not found word for word on the page: "${w.slice(0, 200)}"` });

    let check = await call(READ_MODEL, CHECK_PROMPT, [...images, { type: "text", text: `TRANSCRIPTION:\n${rendered}` }], CHECK_TOOL, 2000);
    /* One second reading when the check found a difference: the reader
       looks again with the checker's notes, which may themselves be
       wrong, and only the image decides. Whatever the next check still
       finds goes to the owner as a flag. */
    if ((check.mismatches ?? []).length > 0) {
      const again = await call(READ_MODEL, AID_PROMPT, [
        ...images,
        { type: "text", text: `Guideline: ${doc.title} (${doc.source_reference}), page ${f.page}.\n\nTHE PAGE'S TEXT LAYER (wording only):\n${pageText.slice(0, 12000)}\n\nA FIRST TRANSCRIPTION:\n${rendered}\n\nA CHECKER WHO TRACED THE IMAGE REPORTED:\n${(check.mismatches as string[]).map((m) => `- ${m}`).join("\n")}\n\nThe checker may be wrong too. Trace every arrow and box on the image yourself and transcribe the aid again, correctly.` },
      ], AID_TOOL, 12000);
      if ((again.nodes ?? []).length || (again.rows ?? []).length) {
        aid.content = { nodes: again.nodes ?? [], edges: again.edges ?? [], columns: again.columns ?? [], rows: again.rows ?? [], footnotes: again.footnotes ?? [] };
        aid.flags = wordingFlags(aid.content, pageText).map((w) => ({ source: "wording" as const, detail: `Not found word for word on the page: "${w.slice(0, 200)}"` }));
        rendered = renderAid(aid);
        check = await call(READ_MODEL, CHECK_PROMPT, [...images, { type: "text", text: `TRANSCRIPTION:\n${rendered}` }], CHECK_TOOL, 2000);
      }
    }
    for (const m of (check.mismatches ?? []) as string[]) aid.flags.push({ source: "image", detail: String(m).slice(0, 600) });

    if (passages.length) {
      const [q] = await embedTexts([rendered.slice(0, 4000)], "query");
      const best = passages.map((p) => ({ p, s: cosine(q, p.e) })).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.p.text);
      const tx = await call(TEXT_MODEL, TEXT_PROMPT, [{ type: "text", text: `GUIDELINE PASSAGES:\n${best.join("\n\n---\n\n")}\n\nTRANSCRIPTION:\n${rendered}` }], TEXT_TOOL, 2000);
      for (const m of (tx.contradictions ?? []) as string[]) aid.flags.push({ source: "text", detail: String(m).slice(0, 600) });
    }
    aids.push(aid);
  }

  const cost = { input: usage.input - before.input, output: usage.output - before.output };
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify({ id, title: doc.title, reference: doc.source_reference, pages: pages.length, candidates: chosen, aids, usage: cost, ms: Date.now() - started }, null, 2));
  console.log(`${id} ${doc.title.slice(0, 55)}: ${pages.length} pages, ${chosen.length} read, ${aids.length} aids (${aids.filter((a) => a.flags.length).length} flagged), ${Math.round((Date.now() - started) / 1000)} s, tokens ${cost.input}/${cost.output}`);
  for (const a of aids) console.log(`   p${a.page} [${a.kind}] ${a.title.slice(0, 80)}${a.flags.length ? `  FLAGS: ${a.flags.map((f) => f.source).join(",")}` : ""}`);
}

// ---------- load ----------
async function load(ids: number[]) {
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^\d+\.json$/.test(f)).filter((f) => ids.length === 0 || ids.includes(Number(f.replace(".json", ""))));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8"));
    const { data: existing } = await db.from("decision_aids").select("id,page,position,status").eq("document_id", r.id);
    for (const a of r.aids as (DecisionAid & { crops: string[] })[]) {
      const prior = (existing ?? []).find((e: any) => e.page === a.page && e.position === a.position);
      if (prior && prior.status !== "draft") continue; // the owner has reviewed it: left alone
      const imagePaths: string[] = [];
      for (const c of a.crops) {
        const key = `aids/${r.id}/${path.basename(c)}`;
        const { error } = await db.storage.from("sources").upload(key, fs.readFileSync(c), { contentType: "image/png", upsert: true });
        if (error) throw new Error(`${key}: ${error.message}`);
        imagePaths.push(key);
      }
      const row = {
        document_id: r.id, page: a.page, position: a.position, title: a.title, kind: a.kind, decision: a.decision,
        applies_to: a.applies_to, content: a.content, flags: a.flags, image_paths: imagePaths, status: "draft",
        extracted_by: `${READ_MODEL} / ${TEXT_MODEL}`, updated_at: new Date().toISOString(),
      };
      const { error } = prior
        ? await db.from("decision_aids").update(row).eq("id", prior.id)
        : await db.from("decision_aids").insert(row);
      if (error) throw new Error(`${r.id} p${a.page}: ${error.message}`);
    }
    console.log(`${r.id}: ${r.aids.length} aids loaded`);
  }
}

const args = process.argv.slice(2);
const named = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (args.includes("--load")) {
  await load(named);
} else {
  const ids = args.includes("--all") ? await guidelineIds() : named;
  const force = args.includes("--force");
  for (const id of ids) {
    if (!force && args.includes("--all") && fs.existsSync(path.join(OUT_DIR, `${id}.json`))) continue;
    try {
      await buildDocument(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message)) {
        console.log(`${id}: the daily quota is used up (${message.slice(0, 100)}). Run again later to carry on.`);
        break;
      }
      console.log(`${id}: failed: ${message.slice(0, 300)}`);
    }
  }
  console.log(`tokens in ${usage.input}, out ${usage.output}`);
}
