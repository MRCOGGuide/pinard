/** Documents in the corpus, filtered by a title substring.
 *  npx tsx scripts/list-docs.mts curriculum
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

const needle = (process.argv[2] ?? "").toLowerCase();
const { data, error } = await db
  .from("content_documents")
  .select("id, title, source_reference, source_year, tog_year, tog_issue")
  .order("id");
if (error) throw error;

const rows = (data ?? []) as {
  id: number;
  title: string | null;
  source_reference: string | null;
  source_year: number | null;
  tog_year: number | null;
}[];
const hits = rows.filter((d) => (d.title ?? "").toLowerCase().includes(needle));
console.log(`${hits.length} of ${rows.length} documents match "${needle}"\n`);
for (const d of hits)
  console.log(
    `  doc ${d.id}  [${d.source_year ?? d.tog_year ?? "?"}]  ${d.title ?? "(untitled)"}`
  );
