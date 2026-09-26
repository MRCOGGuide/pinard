/**
 * Print a proposed bracket beside the question it would go on.
 *
 *   npx tsx scripts/review-brackets.mts out.json
 *   npx tsx scripts/review-brackets.mts out.json 593
 *
 * The checks in name-the-agent.mts establish that the drug is in the
 * passage. They cannot establish that the passage is about this
 * problem: one proposal offered "penicillin and gentamicin" for
 * invasive group A streptococcus from a sentence about early-onset
 * group B streptococcus. So a person reads them, and this prints what
 * a person needs — the stem, the answer, the sentence quoted, and the
 * explanation as it would stand.
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
const db = createAdminClient();

type Proposal = {
  id: number;
  key: string;
  anchor: string;
  insert: string;
  before: string;
  after: string;
  cite?: number;
  quote?: string;
};

const proposals = JSON.parse(
  fs.readFileSync(process.argv[2], "utf8")
) as Proposal[];
const only = process.argv.slice(3).map(Number).filter(Boolean);

for (const p of proposals) {
  if (only.length && !only.includes(p.id)) continue;
  const { data: q } = await db
    .from("generated_questions")
    .select("id, status, format, stem, lead_in, options, correct_key")
    .eq("id", p.id)
    .single();
  if (!q) continue;
  const answer =
    ((q.options ?? []) as { key: string; text: string }[]).find(
      (o) => o.key === q.correct_key
    )?.text ?? "?";
  console.log("=".repeat(72));
  console.log(`#${p.id}  ${q.format}/${q.status}`);
  console.log(`STEM: ${q.stem}`);
  console.log(`ANSWER: ${answer}`);
  if (p.cite) {
    const { data: c } = await db
      .from("content_chunks")
      .select("document_id, content_documents(title)")
      .eq("id", p.cite)
      .single();
    const title =
      (c as unknown as { content_documents: { title: string } | null })
        ?.content_documents?.title ?? "?";
    console.log(`READ IN: chunk ${p.cite} — ${title}`);
    console.log(`QUOTE: ${(p.quote ?? "").replace(/\s+/g, " ")}`);
  }
  console.log(`BRACKET: ${p.insert}`);
  console.log(`NOW: ${p.after}`);
  console.log();
}
