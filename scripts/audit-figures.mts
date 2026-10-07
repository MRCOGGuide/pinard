/**
 * Every figure in every explanation, against the passages it cites.
 *
 *   npx tsx scripts/audit-figures.mts              the pending queue
 *   npx tsx scripts/audit-figures.mts --approved   the approved bank
 *   npx tsx scripts/audit-figures.mts --ids 2028,2053
 *
 * Reads, writes nothing. A figure is supported when a passage the
 * question cites, or the question's own stem and options, contains it
 * with the same unit: see figureGroundingProblems. A finding means one
 * of three things, and the evidence printed is there to tell them
 * apart: the right figure from a passage that was read but not cited
 * (add the citation), a figure the model computed or remembered (take
 * it out), or the check being too literal about a phrasing (say so,
 * and the check is wrong).
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
const { fetchAll } = await import("../src/lib/supabase/all");
const { figureGroundingProblems } = await import("../src/lib/generation");

const args = process.argv.slice(2);
const approved = args.includes("--approved");
const idsArg = args.indexOf("--ids");
const only =
  idsArg >= 0 && args[idsArg + 1]
    ? new Set(args[idsArg + 1].split(",").map((s) => Number(s.trim())))
    : null;

type Row = {
  id: number;
  status: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  explanation: string | null;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
  citation_chunk_ids: number[] | null;
};

const db = createAdminClient();
const all = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, stem, lead_in, options, explanation, explanations, citation_chunk_ids")
    .order("id")
    .range(from, to)
);
const rows = all.filter((r) =>
  only ? only.has(r.id) : approved ? r.status === "approved" : r.status === "pending"
);

/* Every cited passage, fetched once, in batches small enough for a URL. */
const cited = new Set<number>();
for (const r of rows) {
  for (const c of r.citation_chunk_ids ?? []) cited.add(c);
  for (const e of r.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) cited.add(c);
}
const text = new Map<number, string>();
const ids = Array.from(cited);
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", ids.slice(i, i + 200));
  if (error) throw new Error(error.message);
  for (const c of (data ?? []) as { id: number; text: string }[]) text.set(c.id, c.text);
}

console.log(
  `auditing ${rows.length} question(s)${only ? "" : approved ? " (approved)" : " (pending)"} against ${text.size} cited passage(s)\n`
);

let flagged = 0;
let figures = 0;
const byKind = { uncitedButInLibrary: 0, other: 0 };
for (const r of rows) {
  const ownIds = new Set<number>(r.citation_chunk_ids ?? []);
  for (const e of r.explanations ?? []) for (const c of e.citation_chunk_ids ?? []) ownIds.add(c);
  const sources = [
    ...Array.from(ownIds).map((c) => text.get(c) ?? ""),
    r.stem,
    r.lead_in ?? "",
    ...(Array.isArray(r.options) ? r.options.map((o) => o.text) : []),
  ];
  const explanation = [r.explanation ?? "", ...(r.explanations ?? []).map((e) => e.text)].join("\n");
  const problems = figureGroundingProblems(explanation, sources);
  if (!problems.length) continue;
  flagged += 1;
  figures += problems.length;
  console.log(`Q${r.id} [${r.status}]  cites ${Array.from(ownIds).join(", ") || "nothing"}`);
  for (const p of problems) console.log(`   ${p}`);
}

console.log(
  `\n${rows.length - flagged} of ${rows.length} clean; ${flagged} question(s) with ${figures} unsupported figure(s)`
);
void byKind;
