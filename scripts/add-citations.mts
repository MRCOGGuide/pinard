/**
 * Cite the passages that support claims a question made without citing
 * them.
 *
 *   npx tsx scripts/add-citations.mts --plan .review/citation-plan.json            propose
 *   npx tsx scripts/add-citations.mts --plan .review/citation-plan.json --apply    write
 *
 * The plan is a list of {id, chunk_ids, key?}, written after reading
 * each claim beside the passage find-support found for it. Nothing in
 * the question's text changes: the passage is added to the explanation
 * that makes the claim (the correct option's, unless key says
 * otherwise) and to the question, and a passage from another guideline
 * brings that guideline's reference and document with it, so the card
 * names the source it now rests on.
 *
 * Proposals are saved and applied exactly, with the same guard as
 * repair-queue: a question whose explanations, citations or status
 * changed since the proposal was made is skipped.
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
const { figureGroundingProblems } = await import("../src/lib/generation");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const planAt = args.indexOf("--plan");
const PLAN = planAt >= 0 ? args[planAt + 1] : ".review/citation-plan.json";
const PROPOSALS = ".review/citation-proposals.json";

type Explanation = {
  key: string;
  text: string;
  verdict?: string;
  citation_chunk_ids?: number[];
  source_reference?: string;
};
type Row = {
  id: number;
  status: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: Explanation[] | null;
  citation_chunk_ids: number[] | null;
  source_document_ids: number[] | null;
};
type Fields = Pick<Row, "explanations" | "citation_chunk_ids" | "source_document_ids">;
type Proposal = { id: number; before: Fields & { status: string }; after: Fields };

const db = createAdminClient();

if (APPLY) {
  const proposals = JSON.parse(fs.readFileSync(PROPOSALS, "utf8")) as Proposal[];
  let written = 0;
  for (const p of proposals) {
    const { data: now } = await db
      .from("generated_questions")
      .select("status, explanations, citation_chunk_ids, source_document_ids")
      .eq("id", p.id)
      .single();
    const same =
      now &&
      now.status === p.before.status &&
      JSON.stringify(now.explanations) === JSON.stringify(p.before.explanations) &&
      JSON.stringify(now.citation_chunk_ids) === JSON.stringify(p.before.citation_chunk_ids) &&
      JSON.stringify(now.source_document_ids) === JSON.stringify(p.before.source_document_ids);
    if (!same) {
      console.log(`Q${p.id}  SKIPPED: changed since it was proposed`);
      continue;
    }
    const { error } = await db.from("generated_questions").update(p.after).eq("id", p.id);
    if (error) console.log(`Q${p.id}  WRITE FAILED: ${error.message}`);
    else written += 1;
  }
  console.log(`${written} of ${proposals.length} applied`);
  process.exit(0);
}

const plan = JSON.parse(fs.readFileSync(PLAN, "utf8")) as {
  id: number;
  chunk_ids: number[];
  key?: string;
}[];
/* One entry per question, however many claims it had. */
const merged = new Map<number, { chunk_ids: Set<number>; key?: string }>();
for (const p of plan) {
  const m = merged.get(p.id) ?? { chunk_ids: new Set<number>(), key: p.key };
  for (const c of p.chunk_ids) m.chunk_ids.add(c);
  merged.set(p.id, m);
}

const proposals: Proposal[] = [];
for (const [id, want] of merged) {
  const { data } = await db
    .from("generated_questions")
    .select(
      "id, status, stem, lead_in, options, correct_key, explanations, citation_chunk_ids, source_document_ids"
    )
    .eq("id", id)
    .single();
  const q = data as Row | null;
  if (!q) {
    console.log(`Q${id}  NOT FOUND`);
    continue;
  }
  const key = want.key ?? q.correct_key;
  const target = (q.explanations ?? []).find((e) => e.key === key);
  if (!target) {
    console.log(`Q${id}  has no explanation for ${key}`);
    continue;
  }
  const add = Array.from(want.chunk_ids);
  const { data: chunks } = await db
    .from("content_chunks")
    .select("id, text, document_id, content_documents(source_reference)")
    .in("id", add);
  const found = (chunks ?? []) as unknown as {
    id: number;
    text: string;
    document_id: number;
    content_documents: { source_reference: string } | null;
  }[];
  if (found.length !== add.length) {
    console.log(`Q${id}  a chunk in ${add.join(", ")} does not exist`);
    continue;
  }
  const docs = new Set(q.source_document_ids ?? []);
  const refs = (target.source_reference ?? "").split(/;\s*/).filter(Boolean);
  for (const c of found) {
    if (!docs.has(c.document_id)) {
      docs.add(c.document_id);
      const ref = c.content_documents?.source_reference;
      if (ref && !refs.includes(ref)) refs.push(ref);
    }
  }
  const explanations = (q.explanations ?? []).map((e) =>
    e.key === key
      ? {
          ...e,
          citation_chunk_ids: Array.from(new Set([...(e.citation_chunk_ids ?? []), ...add])),
          source_reference: refs.join("; "),
        }
      : e
  );
  const after: Fields = {
    explanations,
    citation_chunk_ids: Array.from(new Set([...(q.citation_chunk_ids ?? []), ...add])),
    source_document_ids: Array.from(docs),
  };
  proposals.push({
    id,
    before: {
      status: q.status,
      explanations: q.explanations,
      citation_chunk_ids: q.citation_chunk_ids,
      source_document_ids: q.source_document_ids,
    },
    after,
  });

  /* What the figure check says once the passages are cited. */
  const { data: all } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", after.citation_chunk_ids ?? []);
  const left = figureGroundingProblems(explanations.map((e) => e.text).join("\n"), [
    ...((all ?? []) as { text: string }[]).map((c) => c.text),
    q.stem,
    q.lead_in ?? "",
    ...q.options.map((o) => o.text),
  ]);
  console.log(
    `Q${id}  explanation ${key} + chunk ${add.join(", ")}${refs.length > 1 ? `  [sources: ${refs.join("; ")}]` : ""}${left.length ? `\n   still: ${left.join(" | ")}` : ""}`
  );
}
fs.writeFileSync(PROPOSALS, JSON.stringify(proposals, null, 1));
console.log(`\n${proposals.length} proposal(s) saved to ${PROPOSALS}; read them, then --apply`);
