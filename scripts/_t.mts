import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);
for (const [k,v] of Object.entries(env)) process.env[k] ??= v as string;
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");
const db = createAdminClient();

const { data: sections } = await db.from("sections").select("id, title, parent_id, sort_order").order("sort_order");
const secs = (sections ?? []) as {id:number;title:string;parent_id:number|null;sort_order:number}[];

const rows = await fetchAll((from,to)=>db.from("generated_questions").select("section_id, format").eq("status","approved").range(from,to));
const counts = new Map<number,{sba:number;emq:number}>();
for (const r of rows as {section_id:number;format:string}[]) {
  const c = counts.get(r.section_id) ?? {sba:0,emq:0};
  if (r.format === "emq") c.emq++; else c.sba++;
  counts.set(r.section_id, c);
}

const leaves = secs.filter((s) => !secs.some((o) => o.parent_id === s.id));
const parentOf = new Map(secs.map(s=>[s.id, s.parent_id]));
const titleOf = new Map(secs.map(s=>[s.id, s.title]));

console.log(`${secs.length} sections, ${leaves.length} leaf sub-topics, ${rows.length} approved questions\n`);
const under: string[] = [];
let ok = 0;
for (const s of leaves) {
  const c = counts.get(s.id) ?? {sba:0,emq:0};
  const total = c.sba + c.emq;
  const parent = s.parent_id ? titleOf.get(s.parent_id) : null;
  if (total >= 30) { ok++; continue; }
  under.push(`${String(total).padStart(4)}  ${(parent ? parent + " › " : "")}${s.title}`);
}
console.log(`leaf sub-topics with >= 30 approved: ${ok} of ${leaves.length}`);
if (under.length) {
  console.log(`\nunder 30 (${under.length}):`);
  for (const u of under.slice(0, 40)) console.log("  " + u);
  if (under.length > 40) console.log(`  … and ${under.length - 40} more`);
}
