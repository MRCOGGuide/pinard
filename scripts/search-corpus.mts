/**
 * Grep the ingested corpus for a phrase, with surrounding context.
 *
 * Verifying a question against its source is the slowest step in a
 * review, and it is the step that catches wrong answers, so it is
 * worth a tool.
 *
 *   npx tsx scripts/search-corpus.mts "four or more risk factors" 6
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

const term = process.argv[2];
const limit = Number(process.argv[3] ?? 6);

const { data, error } = await db
  .from("content_chunks")
  .select("id, document_id, text, content_documents(title)")
  .ilike("text", "%" + term + "%")
  .limit(limit);
if (error) throw error;

const rows = (data ?? []) as unknown as {
  id: number;
  document_id: number;
  text: string;
  content_documents: { title: string | null } | null;
}[];

if (!rows.length) console.log(`no chunk contains "${term}"`);
for (const c of rows) {
  const flat = c.text.replace(/\s+/g, " ");
  const i = flat.toLowerCase().indexOf(term.toLowerCase());
  console.log(`--- chunk ${c.id} (doc ${c.document_id}) ${c.content_documents?.title ?? ""} ---`);
  console.log(flat.slice(Math.max(0, i - 450), i + 700));
  console.log();
}
