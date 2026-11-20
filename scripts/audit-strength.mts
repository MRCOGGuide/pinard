/**
 * Questions firmer than their guidance (src/lib/wordingStrength).
 *
 *   npx tsx --conditions=react-server scripts/audit-strength.mts [--pending] [--out .review/strength.json]
 *
 * Read-only. For every approved question (or the pending queue), each
 * strong word in what a candidate reads ("must", "contraindicated",
 * "never" and the rest) that none of its cited passages uses. Prints
 * totals; the list goes to the --out file, kept out of git.
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
const { strengthProblems } = await import("../src/lib/wordingStrength");

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const status = process.argv.includes("--pending") ? "pending" : "approved";
const out = arg("--out") ?? `.review/strength-${status}.json`;
if (!out.startsWith(".review/")) {
  console.error("--out must be inside .review/, which is kept out of git.");
  process.exit(1);
}
const db = createAdminClient();

type Q = {
  id: number;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[];
  correct_key: string;
  explanation: string | null;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[] | null;
  citation_chunk_ids: number[] | null;
};
const questions = await fetchAll<Q>((f, t) =>
  db.from("generated_questions").select("id, stem, lead_in, options, correct_key, explanation, explanations, citation_chunk_ids").eq("status", status).order("id").range(f, t)
);
const cited = (q: Q) => [...new Set([...(q.citation_chunk_ids ?? []), ...(q.explanations ?? []).flatMap((e) => e.citation_chunk_ids ?? [])])];
const ids = [...new Set(questions.flatMap(cited))];
const text = new Map<number, string>();
for (let i = 0; i < ids.length; i += 200) {
  const { data } = await db.from("content_chunks").select("id, text").in("id", ids.slice(i, i + 200));
  for (const c of data ?? []) text.set(c.id as number, c.text as string);
}

const findings: { id: number; problem: string }[] = [];
for (const q of questions) {
  const passages = cited(q).map((id) => text.get(id) ?? "").filter(Boolean);
  if (!passages.length) continue;
  const answer = (q.explanations ?? []).find((e) => e.key === q.correct_key);
  const parts = [
    { label: "lead-in", text: q.lead_in, stem: true },
    { label: "stem", text: q.stem, stem: true },
    ...q.options.map((o) => ({ label: `option ${o.key}`, text: o.text })),
    { label: "explanation", text: q.explanation },
    { label: "explanation", text: answer?.text },
  ];
  for (const problem of strengthProblems(parts, passages)) findings.push({ id: q.id, problem });
}
const by: Record<string, number> = {};
for (const f of findings) {
  const word = f.problem.match(/says "([^"]+)"/)?.[1]?.toLowerCase() ?? "?";
  by[word] = (by[word] ?? 0) + 1;
}
console.log(`${status}: ${questions.length} read; ${findings.length} strong words the cited passages never use, in ${new Set(findings.map((f) => f.id)).size} questions`);
console.log(`by word: ${JSON.stringify(by)}`);
fs.writeFileSync(out, JSON.stringify(findings, null, 2));
console.log(`list written to ${out}`);
