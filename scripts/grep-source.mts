/** Grep one ingested document. npx tsx scripts/_grep-doc.mts 148 doxycycline */
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
const doc = Number(process.argv[2]);
const term = process.argv[3];
const { data, error } = await db
  .from("content_chunks")
  .select("id, text")
  .eq("document_id", doc)
  .order("chunk_index");
if (error) throw error;
let hits = 0;
for (const c of (data ?? []) as { id: number; text: string }[]) {
  const flat = c.text.replace(/\s+/g, " ");
  const re = new RegExp(term, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    hits++;
    console.log(`--- chunk ${c.id} ---`);
    console.log(flat.slice(Math.max(0, m.index - 320), m.index + 420));
    console.log();
    if (hits > 14) process.exit(0);
  }
}
console.log(`${hits} hits in doc ${doc} (${(data ?? []).length} chunks)`);
