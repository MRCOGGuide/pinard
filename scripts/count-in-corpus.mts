/**
 * How often does a term appear anywhere in the ingested library?
 *
 *   npx tsx scripts/count-in-corpus.mts oseltamivir cyclizine alteplase
 *
 * When the repair refuses a card because no passage names a drug, this
 * says whether the gap is the guidance or the library: a drug absent
 * from the whole corpus cannot be cited by anything, and a drug present
 * in it somewhere means the right document was never retrieved.
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
const db = createAdminClient();

const chunks = await fetchAll<{ id: number; document_id: number; text: string }>(
  (from, to) => db.from("content_chunks").select("id, document_id, text").range(from, to)
);
console.log(`${chunks.length} chunks in the library\n`);

for (const term of process.argv.slice(2)) {
  const re = new RegExp(term, "i");
  const hits = chunks.filter((c) => re.test(c.text));
  const docs = new Set(hits.map((h) => h.document_id));
  console.log(`${term}: ${hits.length} chunk(s) in ${docs.size} document(s)`);
  if (docs.size) {
    const { data: titles } = await db
      .from("content_documents")
      .select("title")
      .in("id", [...docs].slice(0, 5));
    for (const t of titles ?? []) console.log(`   ${t.title}`);
  }
}
