/**
 * Draws the pathway library out of the sources (owner's brief, 11 October
 * 2026, part 2). Run once per topic, in advance, never at question time.
 *
 *   npx tsx --conditions=react-server scripts/build-pathways.mts aspirin-pre-eclampsia vte-prophylaxis
 *   npx tsx --conditions=react-server scripts/build-pathways.mts --all          # every topic not yet drafted
 *   npx tsx --conditions=react-server scripts/build-pathways.mts --all --force  # redraft them all
 *   npx tsx --conditions=react-server scripts/build-pathways.mts --load         # drafts into the pathways table (phase 50)
 *
 * For each topic in scripts/pathway-topics.mts:
 *   1. its primary documents are read in full where they fit, otherwise
 *      their passages that best match the topic, and the whole library is
 *      searched as well, so a second source that adds or disagrees is seen;
 *   2. Opus 4.5 writes the record through a forced tool, every item with
 *      the chunk ids it came from, gaps and disagreements kept as such;
 *   3. each item is checked: its chunk ids must be passages it was given,
 *      and every figure in it must be written in one of them;
 *   4. Sonnet 4.5 reads each surviving item beside its cited passages and
 *      names any whose passages do not say it with the same meaning, or
 *      that apply to a different group: those are removed, never rewritten.
 *
 * Opus 4.5 and Sonnet 4.5 have their own daily quotas on this Bedrock
 * account, so a build never spends what live Ask Pinard answers need
 * (Opus 4.6 and Sonnet 4.6). When a quota runs out the run stops; run it
 * again later and it carries on from the next undrafted topic.
 *
 * Drafts are written to scripts/_pathways/ (git-ignored: the repository is
 * public and drafts quote the guidance). Nothing reaches the database
 * until --load, and nothing reaches a candidate until the owner approves.
 */
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { claudeClient } = await import("../src/lib/anthropic");
const { embedTexts } = await import("../src/lib/voyage");
const { retrieveMany } = await import("../src/lib/retrieval");
const { isReferenceList } = await import("../src/lib/bibliography");
const { formatReference } = await import("../src/lib/reference");
const P = await import("../src/lib/pathways");
const { PATHWAY_TOPICS } = await import("./pathway-topics.mts");
type Topic = (typeof PATHWAY_TOPICS)[number];
type PathwayRecord = import("../src/lib/pathway-shape").PathwayRecord;

const EXTRACT_MODEL = process.env.PATHWAY_MODEL ?? "global.anthropic.claude-opus-4-5-20251101-v1:0";
const CHECK_MODEL = process.env.PATHWAY_CHECK_MODEL ?? "global.anthropic.claude-sonnet-4-5-20250929-v1:0";
/** Tokens of primary guidance read per topic; a longer guideline gives its best-matching passages. */
const PRIMARY_BUDGET = 45000;
/** Passages from the rest of the library, for what adds to or disagrees with the primary source. */
const LIBRARY_EXTRA = 16;
/** Second copies of a guideline uploaded twice (the copy in pathway-topics.mts is read). */
const DUPLICATE_DOCUMENTS = new Set([1012, 5, 7]);
/** Patient Information Leaflets: read only when a topic names one as primary. */
const LEAFLET_SECTION = 40;
const OUT_DIR = "scripts/_pathways";

const db = createAdminClient();
fs.mkdirSync(OUT_DIR, { recursive: true });

type Passage = { id: number; documentId: number; index: number; text: string; source: string; tokens: number };

async function documentLabels(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db
    .from("content_documents")
    .select("id,title,source_reference,source_year,tog_year,tog_issue")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((d: any) => [
      d.id,
      `${d.title}, ${formatReference({ reference: d.source_reference, year: d.source_year, togYear: d.tog_year, togIssue: d.tog_issue })}`,
    ])
  );
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};

async function gatherPassages(topic: Topic): Promise<Passage[]> {
  const queryEmbeddings = await embedTexts([topic.name, ...topic.queries], "query");
  const chosen: Passage[] = [];
  if (topic.docs.length > 0) {
    const { data, error } = await db
      .from("content_chunks")
      .select("id,document_id,chunk_index,text,token_count,embedding")
      .in("document_id", topic.docs);
    if (error) throw new Error(error.message);
    const labels = await documentLabels(topic.docs);
    const rows = (data ?? []).filter((r: any) => !isReferenceList(r.text));
    const total = rows.reduce((n: number, r: any) => n + (r.token_count ?? 0), 0);
    let keep = rows;
    if (total > PRIMARY_BUDGET) {
      const scored = rows
        .map((r: any) => {
          const e: number[] = typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
          return { r, score: Math.max(...queryEmbeddings.map((q) => cosine(q, e))) };
        })
        .sort((a, b) => b.score - a.score);
      keep = [];
      let used = 0;
      for (const { r } of scored) {
        if (used + (r.token_count ?? 0) > PRIMARY_BUDGET) continue;
        keep.push(r);
        used += r.token_count ?? 0;
      }
    }
    // Read in the order the guideline is written.
    keep.sort((a: any, b: any) => topic.docs.indexOf(a.document_id) - topic.docs.indexOf(b.document_id) || a.chunk_index - b.chunk_index);
    for (const r of keep as any[]) {
      chosen.push({ id: r.id, documentId: r.document_id, index: r.chunk_index, text: r.text, source: labels.get(r.document_id) ?? "", tokens: r.token_count ?? 0 });
    }
  }
  const seen = new Set(chosen.map((p) => p.id));
  const searched = await retrieveMany(topic.queries.map((q) => ({ query: q, count: topic.docs.length ? 8 : 15 })));
  const extra: Passage[] = [];
  const cap = topic.docs.length ? LIBRARY_EXTRA : 30;
  for (let rank = 0; extra.length < cap; rank++) {
    let any = false;
    for (const list of searched) {
      const c = list[rank];
      if (!c) continue;
      any = true;
      if (seen.has(c.chunk_id) || topic.docs.includes(c.document_id)) continue;
      if (DUPLICATE_DOCUMENTS.has(c.document_id) || c.section_id === LEAFLET_SECTION) continue;
      seen.add(c.chunk_id);
      extra.push({ id: c.chunk_id, documentId: c.document_id, index: c.chunk_index, text: c.text, source: "", tokens: 0 });
      if (extra.length >= cap) break;
    }
    if (!any) break;
  }
  const labels = await documentLabels([...new Set(extra.map((p) => p.documentId))]);
  for (const p of extra) p.source = labels.get(p.documentId) ?? "";
  return [...chosen, ...extra];
}

const ITEM = {
  type: "object",
  properties: {
    when: { type: "string", description: "The gestation or time the passage ties this to, if any (e.g. 'from 12 weeks until birth', 'at 28 weeks', 'within 6 weeks of birth')." },
    text: { type: "string", description: "One fact or one action, one sentence, as the passage states it; thresholds, doses and figures exactly as written, with units." },
    chunks: { type: "array", items: { type: "integer" }, description: "The ids of the passages that state it." },
    where: { type: "string", description: "The recommendation number or heading the passage prints, if it shows one." },
  },
  required: ["text", "chunks"],
};
const list = (description: string) => ({ type: "array", items: ITEM, description });

const RECORD_TOOL = {
  name: "record_pathway",
  description: "Record the pathway, every item with the passages it came from.",
  input_schema: {
    type: "object" as const,
    properties: {
      in_sources: { type: "boolean", description: "False only if the passages contain no guidance on this pathway at all." },
      applies_when: list("Who the pathway is for: the risk factors or conditions that trigger it, with thresholds exactly as the source states them."),
      maternal_risks: list("Risks to the mother, with the figure the source gives."),
      fetal_risks: list("Risks to the baby (fetus and newborn), with the figure the source gives."),
      condition_on_pregnancy: list("Medical conditions only: the effect of the condition on the pregnancy, mother and baby."),
      pregnancy_on_condition: list("Medical conditions only: the effect of pregnancy on the condition."),
      preconception: list("What is done before pregnancy."),
      booking: list("What is done at booking: bloods, risk assessment, referrals, medication started."),
      antenatal: list("Antenatal care for mother and baby, each with its gestation in 'when', in gestational order."),
      delivery: list("Timing and mode of delivery, with the reasoning the source gives. Always addressed: if the source says usual care is unchanged, say so."),
      intrapartum: list("Care in labour and birth: monitoring, analgesia and anaesthesia, the third stage, what to avoid."),
      postpartum: list("Care after birth: immediate care, what to watch for, follow-up before discharge, future risk with figures, contraception."),
      drugs: list("Each drug with its dose, route, timing and duration as the source states them."),
      escalation: list("When to refer or escalate, and to whom."),
      gaps: { type: "array", items: { type: "string" }, description: "What a complete pathway needs that these passages do not give, one plain line each (e.g. 'Timing of birth: no recommendation in the sources')." },
      conflicts: {
        type: "array",
        description: "Points on which two documents disagree. Each position with its passages. Leave the point out of the fields.",
        items: {
          type: "object",
          properties: {
            topic: { type: "string" },
            positions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, chunks: { type: "array", items: { type: "integer" } } }, required: ["text", "chunks"] } },
          },
          required: ["topic", "positions"],
        },
      },
    },
    required: ["in_sources", "applies_when", "maternal_risks", "fetal_risks", "preconception", "booking", "antenatal", "delivery", "intrapartum", "postpartum", "drugs", "escalation", "gaps", "conflicts"],
  },
};

const EXTRACT_PROMPT = `You build one clinical pathway for an MRCOG revision platform's pathway library, from the SOURCE PASSAGES only. A registrar will follow it: if this risk factor or condition is present, this is what is done, at each stage of the pregnancy. A consultant obstetrician reviews every pathway before it is used.

RULES
- Every item comes from the passages, with the ids of the passages that state it. Nothing from your own knowledge, however sure you are of it: what the passages do not say is not in the pathway. A missing piece goes in "gaps", in one plain line.
- Thresholds, doses, gestations, intervals and risk figures exactly as the passage writes them, with their units. State a risk with its figure where the passage gives one, not as "increased" alone.
- One fact or one action per item, one sentence, written as a registrar would act on it ("Offer aspirin from 12 weeks until birth"). Put the gestation or timing in "when" where the passage ties it to one. Antenatal items in gestational order.
- Each fact once, in the one field it belongs to; two passages saying the same thing make one item citing both. "drugs" lists each regimen once (drug, dose, route, timing, duration), not once per group of women it applies to.
- A pathway, not a literature review: leave out trial results, meta-analyses, relative risks of a treatment's effect and statements of evidence strength. How likely an outcome is for her (a risk figure) does belong, under the risks.
- Guidance before leaflets: a patient information leaflet supports an item only where no guideline passage covers the point.
- Only what applies to the women this pathway is for. A recommendation written for a different group is left out.
- Timing and mode of delivery are always addressed: if the passages say usual timing or mode is unchanged, say so with the citation; if they say nothing, record that in "gaps".
- Postpartum covers immediate care, follow-up before discharge, her future risk with figures, and contraception, where the passages give them.
- Medical conditions fill condition_on_pregnancy and pregnancy_on_condition. Obstetric pathways leave them empty unless the passages state such effects.
- Before recording anything, compare every threshold, dose, gestation and timing across the documents. Where two documents disagree on the same point, do not choose: record both positions in "conflicts", each naming its document, with their passages. That point then appears in NO field: write the item without the disputed detail (e.g. "Offer aspirin from 12 weeks", the dose and stopping time left to the conflict), or leave it out.
- A passage from a review article (TOG) may support an item; where it reports a guideline, cite it as it stands.
- If the passages contain no guidance on this pathway at all, set in_sources to false and leave the fields empty.
- UK English. No markdown. Respond only through the tool.`;

const VERIFY_TOOL = {
  name: "report_items",
  description: "Report which numbered items must be removed, and why.",
  input_schema: {
    type: "object" as const,
    properties: {
      remove: {
        type: "array",
        items: { type: "object", properties: { n: { type: "integer" }, reason: { type: "string" } }, required: ["n", "reason"] },
      },
    },
    required: ["remove"],
  },
};

const VERIFY_PROMPT = `You check a clinical pathway drawn from guidance, item by item, before a consultant reviews it. You do not rewrite anything.

Each numbered item gives its field, its text, and the ids of the passages it cites. Remove an item only when you are sure of one of these:
1. NOT SUPPORTED: something it states is not in its cited passages, or is there with a different meaning: a reversed relationship, a figure attached to the wrong group, outcome or gestation, a "consider" turned into "offer", a threshold changed.
2. WRONG GROUP: the passage gives it for a different group of women than this pathway is for.
3. WRONG FIELD: it is not what its field is for (a risk listed as an action, an intrapartum step under antenatal).
4. EVIDENCE, NOT PATHWAY: it reports a trial, a meta-analysis, a relative risk of a treatment's effect or the strength of evidence, rather than an action or a risk to her.
5. DUPLICATE: it says the same as an earlier item in the same field.
An item saying the guidance makes no recommendation, or that usual care applies, is NOT SUPPORTED unless a cited passage says so in words: an absence belongs in the gaps, not in the pathway.
Keep an item that is supported even if you would have worded it differently, and keep it when unsure. Respond only through the tool; an empty list means every item stands.`;

function quotaHit(message: string) {
  return /too many tokens|throttl|quota|rate.?limit|429/i.test(message);
}

async function build(topic: Topic): Promise<void> {
  const started = Date.now();
  const passages = await gatherPassages(topic);
  const passageText = new Map(passages.map((p) => [p.id, p.text]));
  const formatted = passages.map((p) => `[chunk:${p.id}] (Source: ${p.source})\n${p.text}`).join("\n\n");
  console.log(`${topic.slug}: ${passages.length} passages (${passages.filter((p) => topic.docs.includes(p.documentId)).length} from the primary documents)`);

  const client = claudeClient({ maxRetries: 2, timeout: 600000 });
  const response = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 12000,
    system: EXTRACT_PROMPT,
    tools: [RECORD_TOOL],
    tool_choice: { type: "tool", name: RECORD_TOOL.name },
    messages: [{
      role: "user",
      content: `SOURCE PASSAGES:\n${formatted}\n\nPATHWAY: ${topic.name} (${topic.area === "medical" ? "a medical condition in pregnancy" : topic.area === "gynaecology" ? "a gynaecological pathway" : "an obstetric pathway"}).\nWho it is for, as a first guide: ${topic.triggers.join("; ")}. Take who it is for from the passages, not from this list.`,
    }],
  });
  const tool = response.content.find((b) => b.type === "tool_use");
  const raw = (tool && tool.type === "tool_use" ? tool.input : {}) as Record<string, unknown>;
  const drafted = P.normaliseBody(raw);
  const conflicts = P.normaliseConflicts(raw.conflicts).map((c) => ({
    ...c,
    positions: c.positions.filter((p) => p.chunks.every((id) => passageText.has(id))),
  })).filter((c) => c.positions.length >= 2);
  const gaps = Array.isArray(raw.gaps) ? raw.gaps.filter((g): g is string => typeof g === "string" && g.trim() !== "").map((g) => g.trim()) : [];
  const inSources = raw.in_sources !== false;

  const checked = P.checkItems(drafted, passageText);
  const removed = [...checked.removed];
  let body = checked.body;

  // The read-through: each item beside the passages it cites.
  const numbered: { n: number; key: keyof typeof body; at: number }[] = [];
  for (const { key } of P.PATHWAY_FIELDS) body[key].forEach((_, at) => numbered.push({ n: numbered.length + 1, key, at }));
  let verifyUsage = { input_tokens: 0, output_tokens: 0 };
  if (numbered.length > 0) {
    const cited = P.citedChunks(body);
    const label = new Map(P.PATHWAY_FIELDS.map((f) => [f.key, f.label]));
    const verify = await client.messages.create({
      model: CHECK_MODEL,
      max_tokens: 3000,
      system: VERIFY_PROMPT,
      tools: [VERIFY_TOOL],
      tool_choice: { type: "tool", name: VERIFY_TOOL.name },
      messages: [{
        role: "user",
        content:
          `PATHWAY: ${topic.name}\n\nPASSAGES:\n${passages.filter((p) => cited.includes(p.id)).map((p) => `[chunk:${p.id}] (Source: ${p.source})\n${p.text}`).join("\n\n")}\n\nITEMS:\n` +
          numbered.map(({ n, key, at }) => {
            const item = body[key][at];
            return `${n}. [${label.get(key)}] ${item.when ? `(${item.when}) ` : ""}${item.text} [cites ${item.chunks.join(", ")}]`;
          }).join("\n"),
      }],
    });
    verifyUsage = { input_tokens: verify.usage?.input_tokens ?? 0, output_tokens: verify.usage?.output_tokens ?? 0 };
    const vt = verify.content.find((b) => b.type === "tool_use");
    const drop = ((vt && vt.type === "tool_use" ? vt.input : {}) as { remove?: { n?: number; reason?: string }[] }).remove ?? [];
    const dropSet = new Set<string>();
    for (const d of drop) {
      const hit = numbered.find((x) => x.n === Number(d.n));
      if (!hit) continue;
      dropSet.add(`${hit.key}:${hit.at}`);
      removed.push(`${label.get(hit.key)}: "${body[hit.key][hit.at].text}": ${String(d.reason ?? "").trim()}`);
    }
    const next = P.emptyBody();
    for (const { key } of P.PATHWAY_FIELDS) next[key] = body[key].filter((_, at) => !dropSet.has(`${key}:${at}`));
    body = next;
  }

  const record: PathwayRecord & { passages: { id: number; source: string }[]; usage: unknown; ms: number } = {
    slug: topic.slug,
    name: topic.name,
    area: topic.area,
    status: inSources && P.itemCount(body) > 0 ? "draft" : "not_in_sources",
    triggers: topic.triggers,
    body,
    gaps,
    conflicts,
    source_document_ids: [...new Set(passages.filter((p) => P.citedChunks(body, conflicts).includes(p.id)).map((p) => p.documentId))],
    removed,
    extracted_by: `${EXTRACT_MODEL} / ${CHECK_MODEL}`,
    passages: passages.map((p) => ({ id: p.id, source: p.source })),
    usage: { extract: response.usage, verify: verifyUsage },
    ms: Date.now() - started,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${topic.slug}.json`), JSON.stringify(record, null, 2));
  console.log(
    `  ${record.status}: ${P.itemCount(body)} items kept, ${removed.length} removed, ${gaps.length} gaps, ${conflicts.length} conflicts; ` +
      `${Math.round(record.ms / 1000)} s; tokens in ${response.usage?.input_tokens} out ${response.usage?.output_tokens} (check in ${verifyUsage.input_tokens})`
  );
}

async function load(slugs: string[]): Promise<void> {
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json") && (slugs.length === 0 || slugs.includes(f.replace(/\.json$/, ""))));
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")) as PathwayRecord;
    const { data: existing } = await db.from("pathways").select("id,status").eq("slug", r.slug).maybeSingle();
    if (existing && existing.status === "approved") {
      console.log(`${r.slug}: approved by the owner, left alone`);
      continue;
    }
    const row = {
      slug: r.slug, name: r.name, area: r.area, status: r.status, triggers: r.triggers, body: r.body,
      gaps: r.gaps, conflicts: r.conflicts, source_document_ids: r.source_document_ids, removed: r.removed,
      extracted_by: r.extracted_by, extracted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await db.from("pathways").update(row).eq("id", existing.id)
      : await db.from("pathways").insert(row);
    if (error) throw new Error(`${r.slug}: ${error.message}`);
    console.log(`${r.slug}: ${existing ? "updated" : "added"} as ${r.status}`);
  }
}

const args = process.argv.slice(2);
const named = args.filter((a) => !a.startsWith("--"));
if (args.includes("--load")) {
  await load(named);
} else {
  const force = args.includes("--force");
  const topics = args.includes("--all") ? PATHWAY_TOPICS : PATHWAY_TOPICS.filter((t) => named.includes(t.slug));
  const unknown = named.filter((s) => !PATHWAY_TOPICS.some((t) => t.slug === s));
  if (unknown.length) throw new Error(`no such topic: ${unknown.join(", ")}`);
  for (const topic of topics) {
    if (!force && args.includes("--all") && fs.existsSync(path.join(OUT_DIR, `${topic.slug}.json`))) continue;
    try {
      await build(topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (quotaHit(message)) {
        console.log(`${topic.slug}: the daily quota is used up (${message.slice(0, 120)}). Run again later to carry on.`);
        break;
      }
      console.log(`${topic.slug}: failed: ${message.slice(0, 300)}`);
    }
  }
}
