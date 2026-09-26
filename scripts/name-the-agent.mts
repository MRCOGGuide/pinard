/**
 * Put the drug the guidance names into the explanation, in brackets.
 *
 *   npx tsx scripts/name-the-agent.mts agents.txt out.json
 *   npx tsx scripts/name-the-agent.mts agents.txt out.json --wider
 *   npx tsx scripts/name-the-agent.mts out.json --apply
 *
 * Reads the audit's report, and for each card asks what the SOURCE
 * PASSAGES call the drug for that problem. #1561's explanation said
 * "maternal transplacental antiarrhythmic therapy"; its source says
 * "the most frequently used antiarrhythmics include digoxin,
 * flecainide, sotalol", so the card now reads "maternal transplacental
 * antiarrhythmic therapy (most commonly digoxin, flecainide or
 * sotalol)".
 *
 * Nothing is rewritten. The model returns a bracket and the phrase to
 * hang it on, and this script does the splicing, so the explanation a
 * reviewer approved is the explanation that stays — every word of it,
 * plus a bracket. A rewrite could change the medicine while it was in
 * there; an insertion cannot.
 *
 * Every word inside the bracket must appear in the passages. A model
 * asked for the drug in the guidance will otherwise answer with the
 * drug in its memory, and they are not always the same drug.
 *
 * --apply writes the proposals in out.json and nothing else. It does
 * not re-run the model: the file is what was reviewed, and a row whose
 * explanation has moved since is skipped rather than overwritten.
 *
 * --wider is for the cards its own source cannot answer, which is most
 * of them: the guideline that gives the success rate of antiemetics
 * frequently never names one, because naming drugs is another
 * guideline's job. So the whole ingested library is searched, the
 * model must return the chunk and the sentence it read the drug in,
 * both are checked, and the chunk is added to the explanation's
 * citations — the card then cites the guideline that named the drug as
 * well as the one that carried the figure.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { getChunksByIds, retrieveChunks } = await import("../src/lib/retrieval");
const { claudeClient, claudeModel } = await import("../src/lib/anthropic");
const { ukEnglishProblems, studyAttributionProblems } = await import(
  "../src/lib/generation"
);
const { CLASS_WORD, DRUG_CLASS } = await import("./drug-classes.mts");

const db = createAdminClient();
const apply = process.argv.includes("--apply");
const wider = process.argv.includes("--wider");
/* --apply takes the proposals alone; proposing takes the report first. */
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reportPath = files[0];
const outPath = apply ? files[0] : files[1];

type Proposal = {
  id: number;
  key: string;
  anchor: string;
  insert: string;
  before: string;
  after: string;
  /** The chunk the drug was read in, when it was not the card's own. */
  cite?: number;
  quote?: string;
};

/* ---------------------------------------------------------------- apply */

if (apply) {
  const proposals = JSON.parse(fs.readFileSync(outPath, "utf8")) as Proposal[];
  let written = 0;
  const skipped: string[] = [];
  for (const p of proposals) {
    const { data: row } = await db
      .from("generated_questions")
      .select("id, explanations")
      .eq("id", p.id)
      .single();
    if (!row) {
      skipped.push(`#${p.id} — not found`);
      continue;
    }
    const explanations = (row.explanations ?? []) as {
      key: string;
      text: string;
      citation_chunk_ids?: number[];
    }[];
    const current = explanations.find((e) => e.key === p.key);
    if (!current) {
      skipped.push(`#${p.id} — no explanation for ${p.key}`);
      continue;
    }
    if (current.text !== p.before) {
      skipped.push(`#${p.id} — explanation has changed since it was proposed`);
      continue;
    }
    const next = explanations.map((e) => {
      if (e.key !== p.key) return e;
      const updated = { ...e, text: p.after } as typeof e & {
        citation_chunk_ids?: number[];
      };
      /* A card that now quotes a second guideline must cite it. */
      if (p.cite) {
        const ids = new Set<number>(updated.citation_chunk_ids ?? []);
        ids.add(p.cite);
        updated.citation_chunk_ids = [...ids];
      }
      return updated;
    });
    const { error } = await db
      .from("generated_questions")
      .update({ explanations: next })
      .eq("id", p.id);
    if (error) throw new Error(`#${p.id}: ${error.message}`);
    written++;
  }
  console.log(`${written} explanation(s) now name the drug, ${skipped.length} skipped`);
  for (const s of skipped) console.log(`  ${s}`);
  process.exit(0);
}

/* -------------------------------------------------------------- propose */

const client = claudeClient({ maxRetries: 3 });
const model = claudeModel();

const report = fs.readFileSync(reportPath, "utf8");
const cards: { id: number; anchor: string }[] = [];
{
  const lines = report.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#(\d+) \(/);
    if (!m) continue;
    const anchor = (lines[i + 1] ?? "").trim().replace(/^anchor:\s*/, "");
    if (anchor) cards.push({ id: Number(m[1]), anchor });
  }
}
console.error(`${cards.length} card(s) to name`);

const SYSTEM = `You are adding ONE bracket to the explanation printed under an answered MRCOG Part 2 question.

The explanation refers to a treatment by its class. You are given the SOURCE PASSAGES the question was written from. Name, in brackets, the drug or drugs THOSE PASSAGES give for that problem — so a registrar reading the card knows what to prescribe, not merely what kind of thing to prescribe.

Rules:
  - every word inside the bracket must appear in the passages. If the passages do not name a drug for this problem, return {"insert": null};
  - name a DRUG, not another class. "(antibiotics)", "(SSRIs)", "(HRT)", "(corticosteroids)" name nothing a registrar can write on a chart; "(co-amoxiclav)", "(sertraline)", "(betamethasone)" do. An abbreviation a prescription cannot be written from — LMWH, NACT, HRT — counts as a class, so give the drug beside it or return null;
  - the bracket is short — 60 characters at the outside, and at most three drugs: "(flecainide)", "(most commonly digoxin, flecainide or sotalol)", "(co-amoxiclav)", "(LMWH, usually enoxaparin)";
  - write the bracket as a clinician would write it. Do not copy the passage's punctuation, its dashes or its asides, and do not carry over an agent the passage calls rare;
  - where the passages give one first-line agent, name that one. Where they give a choice, name the drugs plainly: "(most commonly digoxin, flecainide or sotalol)". Say that guidance is divided only where which drug to use is what the question turns on;
  - a dose only if the passages give it and it is short: "(nifedipine 20 mg)";
  - do NOT add a claim. The bracket names drugs; it does not say a drug is better, safer or recommended unless the passages say it in those words;
  - UK spelling and UK drug names, exactly as the passages spell them;
  - never name a study, trial, cohort or registry.

Reply with JSON only:
{"insert":"(…)"} or {"insert":null,"reason":"<one short clause>"}`;

const SYSTEM_WIDER = `You are adding ONE bracket to the explanation printed under an answered MRCOG Part 2 question.

The explanation refers to a treatment by its class, and the guideline the question came from never names a drug. You are given passages from the whole library of ingested guidelines and reviews. Find one that names the drug used for THIS problem, in THIS setting.

Rules:
  - the drug must be the drug for the problem in this question. A passage naming an antibiotic for a different infection, an antiemetic for a different indication, or a dose for a different gestation is the wrong passage — return {"insert": null};
  - name a DRUG, not another class. "(antibiotics)", "(SSRIs)", "(HRT)" name nothing a registrar can write on a chart; "(co-amoxiclav)", "(sertraline)" do;
  - the bracket is short — 60 characters at the outside, and at most three drugs;
  - every word inside the bracket must appear in the passage you quote;
  - do NOT add a claim beyond the name. No "recommended", "safest", "most effective" unless the passage says it in those words;
  - UK spelling and UK drug names, exactly as the passage spells them;
  - never name a study, trial, cohort or registry.

Return the chunk number you read it in and the sentence, copied verbatim from that chunk, that names the drug for this problem.

Reply with JSON only:
{"insert":"(…)","chunk":<number>,"quote":"<the sentence, verbatim>"} or {"insert":null,"reason":"<one short clause>"}`;

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === "\\") {
      escaped = true;
      continue;
    }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/* Words that carry no claim and need not be found in the passages. */
const HARMLESS = new Set([
  "most",
  "commonly",
  "usually",
  "often",
  "typically",
  "either",
  "with",
  "and",
  "or",
  "the",
  "a",
  "an",
  "in",
  "of",
  "for",
  "to",
  "at",
  "by",
  "first",
  "line",
  "second",
  "third",
  "here",
  "this",
  "case",
  "cases",
  "uk",
  "practice",
  "mg",
  "mcg",
  "micrograms",
  "microgram",
  "g",
  "daily",
  "twice",
  "hourly",
  "orally",
  "oral",
  "iv",
  "im",
  "no",
  "consensus",
  "agents",
  "agent",
  "drug",
  "drugs",
  "such",
  "as",
  "e.g",
  "eg",
  "then",
  "plus",
]);

const NEIGHBOURS = 3;

const out: Proposal[] = [];
const refused: string[] = [];
let done = 0;

for (const card of cards) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, section_id, source_document_ids, correct_key, options, explanations")
    .eq("id", card.id)
    .single();
  if (!row) {
    refused.push(`#${card.id} — not found`);
    continue;
  }
  const explanations = (row.explanations ?? []) as {
    key: string;
    text: string;
    citation_chunk_ids?: number[];
  }[];
  const correct = explanations.find((e) => e.key === row.correct_key);
  if (!correct?.text) {
    refused.push(`#${card.id} — no explanation for the answer`);
    continue;
  }
  const before = correct.text;
  if (before.split(card.anchor).length - 1 !== 1) {
    refused.push(`#${card.id} — the phrase "${card.anchor}" is not in the explanation once`);
    continue;
  }

  /*
    The drug is rarely in the cited sentence. #1561 cites the chunk
    with the 90% in it; the drugs are in the chunk after. So the
    neighbours come too.
  */
  const cited = await getChunksByIds(correct.citation_chunk_ids ?? []);
  const wanted = new Set<number>(correct.citation_chunk_ids ?? []);
  for (const c of cited) {
    const { data: near } = await db
      .from("content_chunks")
      .select("id")
      .eq("document_id", c.document_id)
      .gte("chunk_index", c.chunk_index - NEIGHBOURS)
      .lte("chunk_index", c.chunk_index + NEIGHBOURS);
    for (const n of near ?? []) wanted.add(n.id as number);
  }
  /*
    And the drug is often nowhere near the citation at all: a
    guideline states a success rate in its results and names the agents
    in its treatment section pages away. So the question's own
    documents are searched for the class as well, the way the grounding
    audit widens a narrow citation.
  */
  const sourceDocs = new Set<number>([
    ...cited.map((c) => c.document_id),
    ...(((row.source_document_ids ?? []) as number[]) ?? []),
  ]);
  try {
    const found = await retrieveChunks(
      `${card.anchor} — which drug is used, and at what dose`,
      row.section_id ? [row.section_id as number] : null,
      12
    );
    for (const f of found) if (sourceDocs.has(f.document_id)) wanted.add(f.chunk_id);
  } catch {
    // The citation and its neighbours are still a reading.
  }

  /*
    --wider drops the question's own documents as a boundary. Most
    guidance that quotes a figure for a class names no member of it,
    and the drug is in the guideline written about the drug.
  */
  if (wider) {
    try {
      const found = await retrieveChunks(
        `${card.anchor} for ${row.stem.slice(0, 300)} — which drug, and at what dose`,
        null,
        20
      );
      for (const f of found) wanted.add(f.chunk_id);
    } catch {
      // Then there is nothing wider to read, and the narrow set stands.
    }
    /*
      Nearest-meaning search is not enough on its own. Asked for the
      thrombolytic drug it returned twenty chunks about thrombolysis
      and none of the five that say "alteplase", which sit in the
      guideline on acute thromboembolism. So the class word is also
      looked up literally, and the passages that pair it with something
      drug-shaped are brought in. Which of them is about THIS problem
      is still the model's judgement, and it must quote the one it used.
    */
    const cls = DRUG_CLASS.exec(card.anchor)?.[0] ?? DRUG_CLASS.exec(before)?.[0];
    if (cls) {
      const stem = cls.toLowerCase().replace(/(ies|s)$/, "").slice(0, 14);
      const { data: literal } = await db
        .from("content_chunks")
        .select("id, text")
        .ilike("text", `%${stem}%`)
        .limit(400);
      const DRUGLIKE =
        /\b[A-Za-z]{5,}(?:cillin|mycin|micin|oxacin|cycline|parin|olol|dipine|sartan|pril|prost|profen|azole|vir|tinib|platin|taxel|mab|caine|statin|stone|stol|xaban|gatran|metasone|methasone|zine|sone)\b/g;
      const scored = (literal ?? [])
        .map((c) => ({
          id: c.id as number,
          n: new Set((c.text as string).match(DRUGLIKE) ?? []).size,
        }))
        .filter((c) => c.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 8);
      for (const c of scored) wanted.add(c.id);
    }
  }

  const passages = await getChunksByIds([...wanted]);
  if (passages.length === 0) {
    refused.push(`#${card.id} — no passages`);
    continue;
  }
  const corpus = passages
    .map((p) => (wider ? `[chunk ${p.chunk_id}] ${p.text}` : p.text))
    .join("\n\n");

  const body = [
    `QUESTION: ${row.stem}`,
    `ANSWER: ${((row.options ?? []) as { key: string; text: string }[]).find((o) => o.key === row.correct_key)?.text ?? "?"}`,
    `EXPLANATION: ${before}`,
    `THE CLASS TO NAME: ${card.anchor}`,
    `SOURCE PASSAGES:\n${corpus.slice(0, 26000)}`,
  ].join("\n\n");

  try {
    const reply = await client.messages.create({
      model,
      max_tokens: 700,
      system: wider ? SYSTEM_WIDER : SYSTEM,
      messages: [{ role: "user", content: body }],
    });
    const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const json = firstJsonObject(text);
    if (!json) throw new Error("no JSON in reply");
    const parsed = JSON.parse(json) as {
      insert: string | null;
      reason?: string;
      chunk?: number;
      quote?: string;
    };
    if (!parsed.insert) {
      refused.push(`#${card.id} — ${parsed.reason ?? "the passages name no drug"}`);
      continue;
    }
    const insert = parsed.insert.trim();
    if (!/^\([^()]{3,70}\)$/.test(insert)) {
      refused.push(`#${card.id} — not one short bracket: ${insert.slice(0, 60)}`);
      continue;
    }
    /*
      Asked for the drug in the guidance; a model will answer with the
      drug it knows if the guidance does not have one. So every word
      that carries a claim is looked for in the passages, and the
      bracket is dropped whole if any of them is missing.
    */
    /*
      In --wider the bracket is only as good as the passage it was
      read in, so the passage is named and checked: the chunk must be
      one of the ones sent, and the sentence must be in it. A quote
      that cannot be found is a remembered drug wearing a citation.
    */
    let source = corpus;
    if (wider) {
      const chunk = passages.find((x) => x.chunk_id === parsed.chunk);
      if (!chunk) {
        refused.push(`#${card.id} — quoted a passage it was not given`);
        continue;
      }
      const tidy = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
      const quote = tidy(parsed.quote ?? "");
      if (quote.length < 25 || !tidy(chunk.text).includes(quote)) {
        refused.push(`#${card.id} — the sentence it quoted is not in chunk ${parsed.chunk}`);
        continue;
      }
      source = chunk.text;
    }
    const flat = source.toLowerCase();
    const invented = insert
      .slice(1, -1)
      .split(/[^A-Za-z0-9.-]+/)
      .map((w) => w.toLowerCase().replace(/^[.-]+|[.-]+$/g, ""))
      .filter((w) => w.length > 1 && !HARMLESS.has(w) && !/^\d+$/.test(w))
      .filter((w) => !flat.includes(w));
    if (invented.length) {
      refused.push(`#${card.id} — not in the source: ${invented.join(", ")}`);
      continue;
    }
    /*
      An explanation that already names the drug somewhere else does
      not need it twice: #977 recommends "oestrogen cream" in one
      sentence and mentions oestradiol in the next, and a bracket
      would only say it again.
    */
    const words = insert
      .slice(1, -1)
      .split(/[^A-Za-z0-9.-]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 3 && !HARMLESS.has(w));
    const lower = before.toLowerCase();
    const repeated = words.filter((w) => lower.includes(w));
    if (repeated.length) {
      refused.push(`#${card.id} — already named: ${repeated.join(", ")}`);
      continue;
    }
    /*
      A bracket has to end in something prescribable. "(antibiotics)"
      after "antimicrobial prophylaxis", or "(SSRIs first-line)" after
      "antidepressants", has walked around the class and come back.
    */
    const named = insert
      .slice(1, -1)
      .split(/[^A-Za-z0-9-]+/)
      .filter((w) => w.length > 2 && !HARMLESS.has(w.toLowerCase()))
      .filter((w) => !CLASS_WORD.test(w));
    if (named.length === 0) {
      refused.push(`#${card.id} — the bracket names another class, not a drug: ${insert}`);
      continue;
    }
    const uk = ukEnglishProblems(insert);
    if (uk.length) {
      refused.push(`#${card.id} — ${uk.join("; ")}`);
      continue;
    }
    const study = studyAttributionProblems(insert);
    if (study.length) {
      refused.push(`#${card.id} — names evidence: ${study[0].slice(0, 60)}`);
      continue;
    }
    const after = before.replace(card.anchor, `${card.anchor} ${insert}`);
    if (after === before) {
      refused.push(`#${card.id} — nothing spliced`);
      continue;
    }
    out.push({
      id: card.id,
      key: row.correct_key,
      anchor: card.anchor,
      insert,
      before,
      after,
      ...(wider ? { cite: parsed.chunk, quote: parsed.quote } : {}),
    });
  } catch (e) {
    refused.push(`#${card.id} — ${(e as Error).message}`);
  }
  done++;
  if (done % 20 === 0) console.error(`  ${done}/${cards.length} …`);
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 1));

for (const p of out) {
  console.log(`#${p.id}  ${p.anchor} ${p.insert}`);
  if (p.quote) console.log(`   chunk ${p.cite}: ${p.quote.replace(/\s+/g, " ").slice(0, 150)}`);
}
console.log(`\n${out.length} bracket(s) proposed (not saved), ${refused.length} refused`);
for (const r of refused) console.log(`  ${r}`);
