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
const { renderAid, webImagePath } = await import("../src/lib/decision-aid-shape");
const { AID_PROMPT, AID_TOOL, LAYOUT_PROMPT, LAYOUT_TOOL, PARTS_PROMPT, PARTS_TOOL, candidatePages, costEur, guidelineWithAids, readPages, withoutRepeatedHeadings } = await import("../src/lib/decision-aid-extract");
type DecisionAid = import("../src/lib/decision-aid-shape").DecisionAid;
type PageInfo = import("../src/lib/decision-aid-extract").PageInfo;

const READ_MODEL = process.env.AIDS_MODEL ?? "global.anthropic.claude-opus-4-5-20251101-v1:0";
const TEXT_MODEL = process.env.AIDS_TEXT_MODEL ?? "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
/* The owner asked for a cheaper run (12 October 2026). Tested on GTG 37a,
   Sonnet 4.5 found every page Opus did and transcribed its tables with
   86 to 100% of cells identical; every structural error seen was in a
   flowchart. So Sonnet finds the aids and reads tables and boxes, and
   Opus, with its second look and re-reading, reads flowcharts only. */
const FAST_MODEL = process.env.AIDS_FAST_MODEL ?? "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
let spentEur = 0;
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
/** Set by guidelineIds: which group a document is in (4 = Scientific Impact Papers). */
let rankOf: (d: any) => number = () => 0;
const docsById = new Map<number, any>();
async function guidelineIds(): Promise<number[]> {
  const docs: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("content_documents").select("id,section_id,title,source_reference,tog_year,priority").range(f, f + 999);
    docs.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  // Second copies: ESC 2025, BHIVA 2025, BSH red cell antibodies, and GTG 64 (2024; the 2025 edition is 58).
  const duplicates = new Set([1012, 5, 7, 9]);
  /* The owner's order (12 October 2026): RCOG first, then NICE. Within
     each, the documents marked highest priority first. A guideline's
     summary, a correction notice or a patient leaflet repeats the main
     document's tables and charts, so it is left out. */
  /* RCOG statements, letters, policy and workforce papers seldom hold a
     decision aid: they go last, after every clinical document. */
  const clinicalRcog = /Consent Advice|Good Practice|Best Practice|Evidence-based|Clinical Guideline|guidance for the management|recommendations on|Termination of Pregnancy for Fetal|Supporting women|Zika|Coronavirus|Corona virus|Herpes|Laparoscopy in Pregnancy|Care of Women Requesting|Unscheduled Bleeding/i;
  const nonClinical = /statement|position|policy|letter|response|infographic|consultation|framework|workforce|standards|CPD|compensatory|submission|call for|priorities|women.s voices|briefing|report|plan|equality|poverty|climate|air pollution/i;
  const rank = (d: any) => {
    const ref = `${d.title} ${d.source_reference}`;
    if (/GTG|Green-top/i.test(ref)) return 0;
    if (/RCOG/i.test(ref) && clinicalRcog.test(ref) && !nonClinical.test(ref) && !/Scientific Impact|SIP/i.test(ref)) return 1;
    if (/NICE/i.test(ref)) return 2;
    if (/BSH|BCSH|BHIVA|BASHH|FSRH|UKMEC|BMS|BSGE|BGCS|ESC|NHS Scotland/i.test(ref) && !nonClinical.test(ref)) return 3;
    if (/Scientific Impact|SIP/i.test(ref)) return 4;
    return 5;
  };
  rankOf = rank;
  return docs
    .filter((d) => guidelineWithAids(d) && !duplicates.has(d.id))
    .sort((a, b) => rank(a) - rank(b) || (a.priority ?? 2) - (b.priority ?? 2) || a.id - b.id)
    .map((d) => (docsById.set(d.id, d), d))
    .map((d) => d.id);
}

// ---------- pages ----------
function render(pdf: string, dir: string, pages: PageInfo[]) {
  const todo = pages.filter((p) => !fs.existsSync(path.join(dir, `p${p.n}.png`)));
  if (todo.length === 0) return;
  const run = (list: PageInfo[], timeout: number) =>
    execFileSync("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/render-pdf-pages.ps1",
      "-Pdf", pdf, "-OutDir", dir, "-Pages", list.map((p) => `${p.n}:${p.turns}`).join(","), "-Width", String(RENDER_WIDTH),
    ], { stdio: "pipe", timeout, killSignal: "SIGKILL" });
  /* Windows' renderer hung for 50 minutes on one page of the Maternity
     Triage paper and held the whole run. All pages at once, with a time
     limit; on failure, page by page, and a page that will not draw is
     left out rather than stopping the guideline. */
  try {
    run(todo, 30000 * todo.length + 30000);
  } catch {
    for (const p of todo) {
      if (fs.existsSync(path.join(dir, `p${p.n}.png`))) continue;
      try {
        run([p], 60000);
      } catch {
        console.log(`   page ${p.n} would not render: left out`);
      }
    }
  }
}

function crop(specs: { in: string; out: string; box: number[] }[]) {
  if (specs.length === 0) return;
  const spec = path.join(PAGE_DIR, "_crops.json");
  fs.writeFileSync(spec, JSON.stringify(specs));
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/crop-images.ps1", "-Spec", spec], { stdio: "pipe" });
}

/* The model takes images up to 5 MB once encoded. A dense page rendered
   sharp can pass that as a PNG (GTG 51's 2024 update did), so such a
   page is sent as a high-quality JPEG, a fraction of the size. */
const IMAGE_LIMIT = 3.6 * 1024 * 1024;
function png(file: string) {
  if (fs.statSync(file).size > IMAGE_LIMIT) {
    const jpg = file.replace(/\.png$/i, ".jpg");
    // GTG 69 has a 4731 x 3600 page of 14.7 MB: smaller still if the first JPEG is too big.
    for (const side of [3000, 2000]) {
      if (fs.existsSync(jpg) && fs.statSync(jpg).size <= IMAGE_LIMIT) break;
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/to-jpeg.ps1", "-In", file, "-Out", jpg, "-MaxSide", String(side)], { stdio: "pipe" });
    }
    return { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: fs.readFileSync(jpg).toString("base64") } };
  }
  return { type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: fs.readFileSync(file).toString("base64") } };
}

async function call(model: string, system: string, content: any[], tool: any, maxTokens: number): Promise<any> {
  const r = await client.messages.create({
    model, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content }],
  });
  usage.input += r.usage?.input_tokens ?? 0;
  usage.output += r.usage?.output_tokens ?? 0;
  spentEur += costEur(model, r.usage);
  const t = r.content.find((b: any) => b.type === "tool_use") as any;
  return t?.input ?? {};
}

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
  const eurBefore = spentEur;
  const { data: doc } = await db.from("content_documents").select("id,title,source_reference,file_url").eq("id", id).single();
  if (!doc?.file_url) return console.log(`${id}: no stored PDF`);
  const pdfPath = path.join(PDF_DIR, `${id}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    const { data: blob, error } = await db.storage.from("sources").download(doc.file_url);
    if (error || !blob) return console.log(`${id}: download failed (${error?.message})`);
    fs.writeFileSync(pdfPath, new Uint8Array(await blob.arrayBuffer()));
  }
  const pages = await readPages(new Uint8Array(fs.readFileSync(pdfPath)));
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
    /* Opus finds the aids: Sonnet listed 55 on GTG 69 (fragments of single
       charts, recommendation boxes), and transcribing false finds cost
       more than the stronger finder does. A page found to be sideways is
       turned upright and looked at again. */
    let listed = await call(READ_MODEL, LAYOUT_PROMPT, [png(img), { type: "text", text: `Page ${n} of ${doc.title}.` }], LAYOUT_TOOL, 1500);
    const t = Number(listed.turns ?? 0);
    if ([1, 2, 3].includes(t) && (listed.aids ?? []).length > 0) {
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/rotate-image.ps1", "-Path", img, "-Turns", String(t)], { stdio: "pipe" });
      for (const stale of [img.replace(/\.png$/, ".jpg")]) if (fs.existsSync(stale)) fs.unlinkSync(stale);
      listed = await call(READ_MODEL, LAYOUT_PROMPT, [png(img), { type: "text", text: `Page ${n} of ${doc.title}. It has been turned upright.` }], LAYOUT_TOOL, 1500);
    }
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
    const flowchart = f.kind === "flowchart";
    const model = flowchart ? READ_MODEL : FAST_MODEL;
    const t = await call(model, AID_PROMPT, [
      ...images,
      { type: "text", text: `${crops.length > 1 ? "These images are one aid continued across pages, in order. " : ""}Guideline: ${doc.title} (${doc.source_reference}), page ${f.page}.\n\nTHE PAGE'S TEXT LAYER (wording only; take the structure from the image):\n${pageText.slice(0, 6000)}` },
    ], AID_TOOL, 12000);
    const content = withoutRepeatedHeadings({ nodes: t.nodes ?? [], edges: t.edges ?? [], columns: t.columns ?? [], rows: t.rows ?? [], footnotes: t.footnotes ?? [] });
    const aid = { document_id: id, page: f.page, position: aids.filter((a) => a.page === f.page).length + 1, title: String(t.title ?? f.title), kind: (["flowchart", "table", "box"].includes(t.kind) ? t.kind : f.kind) as DecisionAid["kind"], decision: String(t.decision ?? ""), applies_to: Array.isArray(t.applies_to) ? t.applies_to.map(String) : [], content, flags: [] as DecisionAid["flags"], crops };
    let rendered = renderAid(aid);

    // A page that is a picture has no text to check the wording against: said once, plainly.
    const picture = f.parts.every((p) => pages[p.page - 1]?.picture);
    const wordingCheck = (content: any) =>
      picture
        ? [{ source: "wording" as const, detail: "The original is a picture with no text layer, so the wording could not be checked word for word: read it against the picture." }]
        : wordingFlags(content, pageText).map((w) => ({ source: "wording" as const, detail: `Not found word for word on the page: "${w.slice(0, 200)}"` }));
    aid.flags.push(...wordingCheck(aid.content));

    /* The second look at the image, the re-reading and the guideline-text
       check are gone (owner, 2 November 2026): having reviewed all 311
       aids, the owner found them mostly right and the checks' findings
       unhelpful. The owner's own review against the picture is the check;
       the wording comparison, which costs nothing, is kept on record. */
    void rendered;
    aids.push(aid);
  }

  const cost = { input: usage.input - before.input, output: usage.output - before.output, eur: Math.round((spentEur - eurBefore) * 100) / 100 };
  fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify({ id, title: doc.title, reference: doc.source_reference, pages: pages.length, candidates: chosen, aids, usage: cost, ms: Date.now() - started }, null, 2));
  console.log(`${id} ${doc.title.slice(0, 55)}: ${pages.length} pages, ${chosen.length} read, ${aids.length} aids (${aids.filter((a) => a.flags.length).length} flagged), ${Math.round((Date.now() - started) / 1000)} s, €${cost.eur.toFixed(2)} (run total €${spentEur.toFixed(2)})`);
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
        // The web-sized copy Admin shows (scripts/aid-web-images.mts makes the same).
        const web = c.replace(/\.png$/i, ".web.jpg");
        const spec = path.join(PAGE_DIR, "_web.json");
        fs.writeFileSync(spec, JSON.stringify([{ in: c, out: web }]));
        execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/web-images.ps1", "-Spec", spec, "-MaxSide", "1600"], { stdio: "pipe", timeout: 120000 });
        if (fs.existsSync(web)) await db.storage.from("sources").upload(webImagePath(key), fs.readFileSync(web), { contentType: "image/jpeg", upsert: true });
      }
      const row = {
        document_id: r.id, page: a.page, position: a.position, title: a.title, kind: a.kind, decision: a.decision,
        applies_to: a.applies_to, content: a.content, flags: a.flags, image_paths: imagePaths, status: "draft",
        extracted_by: `${FAST_MODEL} (finding, tables) / ${READ_MODEL} (flowcharts)`, updated_at: new Date().toISOString(),
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
// Not the number after --budget, which is an amount: --budget 15 once searched document 15 too.
const named = args.filter((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--budget").map(Number);
if (args.includes("--load")) {
  await load(named);
} else {
  let ids = args.includes("--all") ? await guidelineIds() : named;
  // --sips: only the Scientific Impact Papers (owner, 2 November 2026), not the statements after them.
  if (args.includes("--sips")) ids = ids.filter((id) => rankOf(docsById.get(id)) === 4);
  const force = args.includes("--force");
  /* A spending cap in euro (--budget 40): no new guideline is started
     once the run has spent within EUR 2 of it, the most one has cost. */
  const budget = args.includes("--budget") ? Number(args[args.indexOf("--budget") + 1]) : Infinity;
  if (args.includes("--list")) {
    const { data } = await db.from("content_documents").select("id,title,source_reference").in("id", ids);
    const byId = new Map((data ?? []).map((d: any) => [d.id, d]));
    ids.forEach((id, i) => console.log(`${i + 1}. ${id} ${byId.get(id)?.title.slice(0, 70)} | ${byId.get(id)?.source_reference?.slice(0, 30)}`));
    process.exit(0);
  }
  for (const id of ids) {
    if (!force && args.includes("--all") && fs.existsSync(path.join(OUT_DIR, `${id}.json`))) continue;
    if (spentEur > budget - 2) {
      console.log(`Stopped before ${id}: the run has spent €${spentEur.toFixed(2)} of its €${budget} cap.`);
      break;
    }
    try {
      await buildDocument(id);
      // Into Admin as each guideline is done, so the owner can review as it goes.
      if (args.includes("--load-each")) await load([id]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message)) {
        console.log(`${id}: the daily quota is used up (${message.slice(0, 100)}). Run again later to carry on.`);
        break;
      }
      console.log(`${id}: failed: ${message.slice(0, 300)}`);
    }
  }
  console.log(`tokens in ${usage.input}, out ${usage.output}; spent €${spentEur.toFixed(2)}`);
}
