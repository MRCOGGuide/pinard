/**
 * Builds the legal index (the owner's brief, part 4): every law, legal
 * case and piece of professional or regulatory guidance named in the
 * library, with what it establishes and where it appears.
 *
 *   npx tsx --conditions=react-server scripts/build-legal-index.mts --extract [--limit 40]
 *   npx tsx --conditions=react-server scripts/build-legal-index.mts --merge
 *   npx tsx --conditions=react-server scripts/build-legal-index.mts --tidy
 *   npx tsx --conditions=react-server scripts/build-legal-index.mts --load      # into legal_index (phase 52)
 *
 *   1. --extract: every passage that names an Act, a case, a regulator or
 *      a statutory code is read once, and what it says each one
 *      establishes is noted. Carries on from where a run stopped.
 *   2. --merge: the names are grouped ("MCA 2005", "the Mental Capacity
 *      Act") and each entry's statements become a short account of what
 *      it establishes, from those statements alone.
 *   3. --tidy: one look over the whole list. The same guidance named two
 *      ways becomes one entry; what is not law or regulation (a clinical
 *      guideline, a report, a curriculum) goes.
 *   4. --load: the entries go into legal_index as drafts for the owner.
 *      One the owner has reviewed is left alone.
 *
 * Output: scripts/_legal_index/ (git-ignored: the repository is public).
 */
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { aidsFastModel, claudeClient } = await import("../src/lib/anthropic");
const { isReferenceList } = await import("../src/lib/bibliography");

const OUT_DIR = "scripts/_legal_index";
const NOTES = path.join(OUT_DIR, "notes.jsonl");
const INDEX = path.join(OUT_DIR, "index.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

const db = createAdminClient();
const client = claudeClient({ maxRetries: 3, timeout: 120000 });
/** USD per million tokens, in and out, and the euro rate the pricing model uses. */
const PRICE = (model: string): [number, number] => (/haiku/.test(model) ? [1, 5] : [3, 15]);
const USD_EUR = 1 / 1.1206;
let spentEur = 0;

async function ask(model: string, system: string, text: string, tool: any, maxTokens: number): Promise<any> {
  let r: any;
  for (let tries = 0; ; tries++) {
    try {
      r = await client.messages.create({
        model, max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: text }],
      });
      break;
    } catch (error: any) {
      // The rate limit clears within a minute; a run should wait, not stop.
      if (error?.status !== 429 || tries >= 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }
  }
  const [pin, pout] = PRICE(model);
  spentEur += (((r.usage?.input_tokens ?? 0) * pin + (r.usage?.output_tokens ?? 0) * pout) / 1e6) * USD_EUR;
  const t = r.content.find((b: any) => b.type === "tool_use") as any;
  return t?.input ?? {};
}

// ---------- 1. reading the passages ----------

/** A passage worth reading names an authority; "legal" alone mostly does not. */
const NAMED = /\bAct(?: of)? (?:1[89]\d\d|20\d\d)\b|\b(?:Regulations|Order|Rules) (?:19|20)\d\d\b|\b[A-Z][A-Za-z'’.-]+(?: [A-Z][A-Za-z'’.-]+){0,4} v\.? [A-Z][A-Za-z'’.-]+|\bRe [A-Z]{1,2}\b|\bMontgomery\b|\bBolam\b|\bBolitho\b|\bGillick\b|\bFraser\b|\bSidaway\b|\bGeneral Medical Council\b|\bGMC\b|\bNursing and Midwifery Council\b|\bNMC\b|\bduty of candour\b|\bCourt of Protection\b|\bHigh Court\b|\bSupreme Court\b|\bCourt of Appeal\b|\bHouse of Lords\b|\bcase law\b|\bHuman Rights\b|\bHFEA\b|\bHuman Tissue Authority\b|\bCoroner\b|\bProcurator Fiscal\b|\bDeprivation of Liberty\b|\bmandatory report|\bGDPR\b|\bCaldicott\b|\bCode of Practice\b|\bfundamental standards?\b|\bPregnancy Prevention Programme\b/;

const NOTE_TOOL = {
  name: "note_authorities",
  description: "Note each law, case or guidance the passage says something about.",
  input_schema: {
    type: "object" as const,
    properties: {
      authorities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Its full standard name with its year, e.g. 'Mental Capacity Act 2005', 'Montgomery v Lanarkshire Health Board (2015)', 'GMC Decision making and consent (2020)'." },
            kind: { type: "string", enum: ["law", "case", "guidance"] },
            jurisdiction: { type: "string", description: "Where it applies, if the passage says: 'England and Wales', 'Scotland', 'Northern Ireland', 'UK'. Empty if it does not say." },
            statement: { type: "string", description: "What the passage says it establishes, requires, permits or forbids, in one sentence of at most 35 words, in the passage's meaning and nothing beyond it." },
          },
          required: ["name", "kind", "statement"],
        },
      },
    },
    required: ["authorities"],
  },
};
const NOTE_PROMPT = `You index the law and professional regulation in one passage from the library of a UK revision tool for obstetrics and gynaecology trainees.

List every law, legal case and piece of professional or regulatory guidance that the passage NAMES and SAYS SOMETHING ABOUT:
- law: Acts, regulations, statutory instruments, conventions (e.g. the European Convention on Human Rights);
- case: a court judgment;
- guidance: guidance from a professional regulator or statutory body on what a doctor or service must do (GMC, NMC, HFEA Code of Practice, CQC regulations and fundamental standards, MHRA requirements, a statutory code of practice, statutory multi-agency guidance), and the professional duties they set (e.g. the duty of candour).

Leave out:
- clinical guidelines cited for their clinical content (NICE, RCOG Green-top Guidelines, BSH and the like), inquiries and reports, audits and research studies;
- a body named with no requirement or finding attached;
- laws that appear only as drafting: a list of consequential amendments, a section heading, a commencement clause, an entry in a reference list.

The statement is what THIS passage says, not what you know about the law. If the passage says nothing about what it establishes, leave it out. If there is nothing to note, return an empty list.`;

async function extract(limit: number) {
  const done = new Set<number>();
  if (fs.existsSync(NOTES)) for (const l of fs.readFileSync(NOTES, "utf8").split("\n")) if (l.trim()) done.add(JSON.parse(l).chunk_id);
  const queue: { id: number; document_id: number; text: string }[] = [];
  let seen = 0;
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("content_chunks").select("id,document_id,text").order("id").range(from, from + 999);
    for (const c of data ?? []) {
      seen++;
      if (done.has(c.id) || isReferenceList(c.text) || !NAMED.test(c.text)) continue;
      queue.push(c as any);
    }
    if (!data || data.length < 1000) break;
  }
  console.log(`${seen} passages, ${queue.length} to read, ${done.size} already read`);
  const work = limit ? queue.sort(() => Math.random() - 0.5).slice(0, limit) : queue;
  /* Not Haiku: live Ask Pinard plans with it, with no retries, and a run
     at four at a time used up its rate limit, so answers lost their plans
     (4 November 2026). Sonnet 4.5 has its own quota. */
  const model = process.env.LEGAL_MODEL ?? aidsFastModel();
  let n = 0;
  const workers = Array.from({ length: 4 }, async () => {
    for (;;) {
      const c = work.shift();
      if (!c) return;
      try {
        const r = await ask(model, NOTE_PROMPT, `PASSAGE:\n${c.text}`, NOTE_TOOL, 1500);
        fs.appendFileSync(NOTES, JSON.stringify({ chunk_id: c.id, document_id: c.document_id, authorities: r.authorities ?? [] }) + "\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${c.id}: ${message.slice(0, 120)}`);
        if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message)) await new Promise((r) => setTimeout(r, 20000));
      }
      if (++n % 100 === 0) console.log(`${n} read, EUR ${spentEur.toFixed(2)}`);
    }
  });
  await Promise.all(workers);
  console.log(`read ${n}, spent EUR ${spentEur.toFixed(2)}`);
}

// ---------- 2. grouping and writing each entry ----------

type Note = { chunk_id: number; document_id: number; name: string; kind: string; jurisdiction?: string; statement: string };

const GROUP_TOOL = {
  name: "group_names",
  description: "Group the names that mean the same law, case or guidance.",
  input_schema: {
    type: "object" as const,
    properties: {
      groups: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The standard name, with its year." },
            kind: { type: "string", enum: ["law", "case", "guidance"] },
            numbers: { type: "array", items: { type: "integer" }, description: "The numbers of the names that mean this one." },
          },
          required: ["name", "kind", "numbers"],
        },
      },
    },
    required: ["groups"],
  },
};
const GROUP_PROMPT = `These names of laws, legal cases and professional or regulatory guidance were noted from a UK library, each with how often it was noted. Group the ones that mean the same thing, under its standard name with its year ("MCA 2005", "the Mental Capacity Act" and "Mental Capacity Act 2005 (England and Wales)" are one). Keep apart things that really differ: an Act from the code of practice under it, a later Act from an earlier one, different cases, the same Act's Scottish and English counterparts. Every number goes in exactly one group. A name that is not a law, a case or guidance from a regulator or statutory body (a clinical guideline, a report, an organisation with no guidance named) goes in a group called "NOT AN AUTHORITY".`;

const ENTRY_TOOL = {
  name: "write_entry",
  description: "Write the index entry.",
  input_schema: {
    type: "object" as const,
    properties: {
      establishes: { type: "string", description: "What it establishes, in two or three plain sentences, at most 70 words." },
      topics: { type: "array", items: { type: "string" }, description: "Up to six short topics a question might raise, in a clinician's words, e.g. 'capacity', 'declining blood', 'a girl under 16', 'termination of pregnancy', 'confidentiality', 'stillbirth registration'." },
      jurisdiction: { type: "string", description: "Where it applies, if the statements say. Empty if they do not." },
      bears_on_care: { type: "boolean", description: "Does it bear on the care of patients or the conduct of doctors and services? False for what is only property, trusts, court procedure or the like." },
    },
    required: ["establishes", "topics", "bears_on_care"],
  },
};
const ENTRY_PROMPT = `Write one entry of a legal index for UK obstetrics and gynaecology trainees. You are given what passages in the library say about one law, case or piece of guidance. Say what it establishes, using those statements alone: add nothing you know from elsewhere, and leave out what does not bear on the care of patients or the conduct of doctors. UK English, plain and exact, no preamble ("This Act..." not "The statements say...").`;

/** Judged not to bear on care, read by eye, and kept: each bears on a death, a birth, a child or consent. */
const ALWAYS_KEPT = /McCulloch|Stillbirth \(Definition\)|Coroners and Justice Act|Children and Young Persons Act 1933|Adoption and Children Act|Limitation Act|Medical Devices Regulations|Misuse of Drugs Act|Inquiries Act/;

async function merge() {
  const notes: Note[] = [];
  for (const l of fs.readFileSync(NOTES, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const r = JSON.parse(l);
    for (const a of r.authorities) if (a.name && a.statement) notes.push({ chunk_id: r.chunk_id, document_id: r.document_id, ...a });
  }
  const tally = new Map<string, number>();
  for (const n of notes) tally.set(n.name.trim(), (tally.get(n.name.trim()) ?? 0) + 1);
  const names = [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${notes.length} notes, ${names.length} names`);

  const groupsFile = path.join(OUT_DIR, "groups.json");
  /* Kept as the names themselves, not their numbers in the list: more
     notes shift the numbers, and groups saved by number then pointed at
     the wrong law (4 November 2026: the FGM offence under the Fines and
     Recoveries Act). */
  let groups: { name: string; kind: string; names: string[] }[];
  if (fs.existsSync(groupsFile)) groups = JSON.parse(fs.readFileSync(groupsFile, "utf8"));
  else {
    groups = [];
    // Alphabetical batches keep each list inside one reply; the same Act's spellings sit together.
    for (let from = 0; from < names.length; from += 150) {
      const list = names.slice(from, from + 150).map(([n, c], i) => `${from + i}. ${n} (${c})`).join("\n");
      const r = await ask(aidsFastModel(), GROUP_PROMPT, list, GROUP_TOOL, 12000);
      for (const g of (r.groups ?? []) as { name: string; kind: string; numbers: number[] }[]) {
        groups.push({ name: g.name, kind: g.kind, names: g.numbers.map((n) => names[n]?.[0]).filter(Boolean) });
      }
      console.log(`grouped ${Math.min(from + 150, names.length)} of ${names.length}, EUR ${spentEur.toFixed(2)}`);
    }
    fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
  }

  // Batches can name one Act twice: the same standard name is one entry.
  const byName = new Map<string, { name: string; kind: string; names: string[] }>();
  for (const g of groups) {
    if (/not an authority/i.test(g.name)) continue;
    const key = g.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const prior = byName.get(key);
    if (prior) prior.names.push(...g.names);
    else byName.set(key, { ...g, names: [...g.names] });
  }

  const { data: docs } = await db.from("content_documents").select("id,title,priority").limit(2000);
  const priority = new Map((docs ?? []).map((d: any) => [d.id, d.priority ?? 2]));
  const entriesFile = path.join(OUT_DIR, "entries.jsonl");
  const entries: any[] = fs.existsSync(entriesFile) ? fs.readFileSync(entriesFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  const leftOut: string[] = entries.filter((e) => e.left_out).map((e) => e.name);
  const written = new Set(entries.map((e) => e.name));
  const list = [...byName.values()].filter((g) => !written.has(g.name));
  console.log(`${written.size} entries already written, ${list.length} to write`);
  let i = 0;
  await Promise.all(Array.from({ length: 2 }, async () => {
    for (;;) {
      const g = list[i++];
      if (!g) return;
      const wanted = new Set(g.names);
      const mine = notes.filter((n) => wanted.has(n.name.trim())).sort((a, b) => (priority.get(a.document_id) ?? 2) - (priority.get(b.document_id) ?? 2));
      if (mine.length === 0) continue;
      // One statement a passage, and no one document taking all the room.
      const perDoc = new Map<number, number>();
      const chosen = mine.filter((n) => {
        const c = perDoc.get(n.document_id) ?? 0;
        perDoc.set(n.document_id, c + 1);
        return c < 8;
      }).slice(0, 40);
      const r = await ask(aidsFastModel(), ENTRY_PROMPT, `${g.name}\n\nWHAT THE PASSAGES SAY:\n${chosen.map((n) => `- ${n.statement}`).join("\n")}`, ENTRY_TOOL, 500);
      if (r.bears_on_care === false && !ALWAYS_KEPT.test(g.name)) {
        leftOut.push(g.name);
        fs.appendFileSync(entriesFile, JSON.stringify({ name: g.name, left_out: true }) + "\n");
        continue;
      }
      const entry = {
        name: g.name, kind: g.kind, jurisdiction: r.jurisdiction ?? "", establishes: r.establishes ?? "", topics: r.topics ?? [],
        mentions: chosen.slice(0, 24).map((n) => ({ document_id: n.document_id, chunk_id: n.chunk_id, statement: n.statement })),
        passages: new Set(mine.map((n) => n.chunk_id)).size,
      };
      entries.push(entry);
      fs.appendFileSync(entriesFile, JSON.stringify(entry) + "\n");
      if (entries.length % 50 === 0) console.log(`${entries.length} entries, EUR ${spentEur.toFixed(2)}`);
    }
  }));
  const index = entries.filter((e) => !e.left_out).sort((a, b) => a.kind.localeCompare(b.kind) || b.passages - a.passages);
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "left-out.json"), JSON.stringify(leftOut.sort(), null, 2));
  console.log(`${index.length} entries (${index.filter((e) => e.kind === "law").length} laws, ${index.filter((e) => e.kind === "case").length} cases, ${index.filter((e) => e.kind === "guidance").length} guidance), ${leftOut.length} left out, spent EUR ${spentEur.toFixed(2)}`);
}

// ---------- 3. one look over the whole list ----------

const TIDY_TOOL = {
  name: "tidy_index",
  description: "Say which entries are the same, and which are not law or regulation.",
  input_schema: {
    type: "object" as const,
    properties: {
      same: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "The one standard name for them, with the year of the current edition if the entries give one." },
            numbers: { type: "array", items: { type: "integer" } },
          },
          required: ["name", "numbers"],
        },
      },
      drop: { type: "array", items: { type: "integer" }, description: "The numbers of entries that are not a law, a case or guidance from a regulator or statutory body." },
    },
    required: ["same", "drop"],
  },
};
const TIDY_PROMPT = `This is the draft of a legal index for UK obstetrics and gynaecology trainees: every law, legal case and piece of professional or regulatory guidance named in a library. Each line gives a number, its name and the start of what it establishes.

SAME: list the entries that are one thing under different names, whether spelled differently ("GMC" and "General Medical Council") or different editions of one document (Good Medical Practice 2013, 2019 and 2023 are one entry). An Act and the code of practice under it stay apart, as do different Acts and different cases. Only groups of two or more.

DROP: list the entries that are NOT a law, a case, or guidance from a professional regulator or statutory body on what a doctor or service must do. That means clinical guidelines (NICE, RCOG, BSH, FSRH, ESHRE and the like), reports and inquiries, strategies, curricula, training, feedback and appraisal frameworks, and research. Keep anything on consent, capacity, confidentiality, safeguarding, reporting, records, registration of births and deaths, or a doctor's duties.`;

async function tidy() {
  const entries: any[] = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const list = entries.map((e, i) => `${i}. ${e.name} (${e.kind}): ${e.establishes.slice(0, 90)}`).join("\n");
  const r = await ask(aidsFastModel(), TIDY_PROMPT, list, TIDY_TOOL, 12000);
  const gone = new Set<number>((r.drop ?? []).map(Number));
  const merged: any[] = [];
  for (const g of (r.same ?? []) as { name: string; numbers: number[] }[]) {
    const parts = g.numbers.map((n) => entries[n]).filter(Boolean);
    const kept = g.numbers.filter((n) => entries[n] && !gone.has(n));
    if (parts.length < 2 || kept.length === 0) continue;
    for (const n of g.numbers) gone.add(n);
    const seen = new Set<number>();
    const mentions = parts.flatMap((p) => p.mentions).filter((m) => !seen.has(m.chunk_id) && seen.add(m.chunk_id));
    const w = await ask(aidsFastModel(), ENTRY_PROMPT, `${g.name}\n\nWHAT THE PASSAGES SAY:\n${mentions.slice(0, 40).map((m) => `- ${m.statement}`).join("\n")}`, ENTRY_TOOL, 500);
    merged.push({
      name: g.name, kind: parts[0].kind, jurisdiction: w.jurisdiction ?? "", establishes: w.establishes ?? "", topics: w.topics ?? [],
      mentions: mentions.slice(0, 24), passages: parts.reduce((sum, p) => sum + p.passages, 0),
    });
  }
  const dropped = entries.filter((_, i) => (r.drop ?? []).map(Number).includes(i)).map((e) => e.name);
  const index = [...entries.filter((_, i) => !gone.has(i)), ...merged].sort((a, b) => a.kind.localeCompare(b.kind) || b.passages - a.passages);
  fs.writeFileSync(INDEX.replace(".json", "-untidied.json"), JSON.stringify(entries, null, 2));
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "dropped.json"), JSON.stringify(dropped.sort(), null, 2));
  console.log(`${entries.length} entries became ${index.length} (${index.filter((e) => e.kind === "law").length} laws, ${index.filter((e) => e.kind === "case").length} cases, ${index.filter((e) => e.kind === "guidance").length} guidance): ${merged.length} merged, ${dropped.length} dropped, spent EUR ${spentEur.toFixed(2)}`);
}

// ---------- 4. loading ----------

async function load() {
  const entries = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  const { data: existing, error } = await db.from("legal_index").select("id,name,status");
  if (error) throw new Error(`${error.message}: run supabase/phase52-legal-index.sql first`);
  const byName = new Map((existing ?? []).map((e: any) => [e.name, e]));
  let saved = 0;
  for (const e of entries) {
    const prior: any = byName.get(e.name);
    if (prior && prior.status !== "draft") continue;
    const row = { name: e.name, kind: e.kind, jurisdiction: e.jurisdiction, establishes: e.establishes, topics: e.topics, mentions: e.mentions, status: "draft", updated_at: new Date().toISOString() };
    const { error: failed } = prior ? await db.from("legal_index").update(row).eq("id", prior.id) : await db.from("legal_index").insert(row);
    if (failed) throw new Error(`${e.name}: ${failed.message}`);
    saved += 1;
  }
  console.log(`${saved} entries loaded`);
}

const args = process.argv.slice(2);
if (args.includes("--extract")) await extract(args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : 0);
else if (args.includes("--merge")) await merge();
else if (args.includes("--tidy")) await tidy();
else if (args.includes("--load")) await load();
else console.log("Say --extract, --merge, --tidy or --load.");
