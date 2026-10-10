/**
 * Picks the fixed free sample diagnostic and writes it into
 * supabase/phase46-free-diagnostic.sql, for the owner to run.
 *
 *   npx tsx --conditions=react-server scripts/pick-free-diagnostic.mts
 *
 * Read-only against the database: it only reads the bank and writes the
 * SQL file. One question from each section, at most 35, about one in
 * four an EMQ scenario, at mixed difficulty (lib/diagnostic,
 * pickFreeDiagnostic). Over 35 sections, the last governance sections are
 * left out first. Leaves
 * out the fifteen free sample questions and the public sample page's
 * questions, so the diagnostic is not answerable from having just
 * practised them.
 *
 * Run it again after a big change to the bank, or when a pinned
 * question is retired (a retired question simply drops out of the free
 * diagnostic, leaving its section unasked), then run the new SQL.
 */
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");
const { leafSections } = await import("../src/lib/performance");
const { pickFreeDiagnostic } = await import("../src/lib/diagnostic");

type Row = {
  id: number;
  section_id: number;
  format: "sba" | "emq";
  difficulty: number | null;
  emq_group_id: string | null;
  free_sample?: boolean | null;
  showcase?: boolean | null;
};
type SectionRow = { id: number; title: string; parent_id: number | null; sort_order: number | null; is_active: boolean; exam: string };

const admin = createAdminClient();
const { data: sectionData } = await admin.from("sections").select("*").eq("exam", "part2");
const sections = (sectionData ?? []) as SectionRow[];
const byId = new Map(sections.map((s) => [s.id, s]));
const leaves = leafSections(sections as never) as unknown as SectionRow[];
const key = (s: SectionRow) => {
  const parent = s.parent_id ? byId.get(s.parent_id) ?? s : s;
  return (parent.sort_order ?? 0) * 1000 + (s.parent_id ? s.sort_order ?? 0 : 0);
};
const order = leaves
  .filter((s) => s.is_active)
  .sort((a, b) => key(a) - key(b) || a.id - b.id)
  .map((s) => s.id);

const rows = await fetchAll<Row>((from, to) =>
  admin
    .from("generated_questions")
    .select("id, section_id, format, difficulty, emq_group_id, free_sample, showcase")
    .eq("status", "approved")
    .order("id")
    .range(from, to)
);

// The fifteen sample questions, exactly as sampler_question_ids (phase45) picks them.
const active = new Set(sections.filter((s) => s.is_active).map((s) => s.id));
const firstPerSection: { id: number; n: number; sort: number; section: number }[] = [];
const seenCount = new Map<number, number>();
for (const r of rows.filter((r) => r.format === "sba" && active.has(r.section_id))) {
  const n = (seenCount.get(r.section_id) ?? 0) + 1;
  seenCount.set(r.section_id, n);
  firstPerSection.push({ id: r.id, n, sort: byId.get(r.section_id)?.sort_order ?? 0, section: r.section_id });
}
firstPerSection.sort((a, b) => a.n - b.n || a.sort - b.sort || a.section - b.section);
const sampler = firstPerSection.slice(0, 15).map((x) => x.id);

const exclude = new Set<number>([
  ...sampler,
  ...rows.filter((r) => r.free_sample || r.showcase).map((r) => r.id),
]);

const governance = sections.find((s) => !s.parent_id && s.title === "Governance");
const dropFirst = order.filter((id) => byId.get(id)?.parent_id === governance?.id).reverse();
const picked = pickFreeDiagnostic(
  order,
  rows.map((r) => ({ id: r.id, sectionId: r.section_id, format: r.format, difficulty: r.difficulty, groupId: r.emq_group_id })),
  exclude,
  { dropFirst }
);

const difficulty = new Map(rows.map((r) => [r.id, r.difficulty]));
const lines: string[] = [];
let position = 0;
for (const item of picked) {
  for (const id of item.ids) {
    position += 1;
    lines.push(`  (${position}, ${id}, ${item.sectionId})`);
  }
}

const sbaItems = picked.filter((p) => p.kind === "sba").length;
const emqItems = picked.filter((p) => p.kind === "emq");
const spread: Record<string, number> = {};
for (const p of picked) for (const id of p.ids) spread[String(difficulty.get(id) ?? "?")] = (spread[String(difficulty.get(id) ?? "?")] ?? 0) + 1;

console.log(`Sections: ${picked.length} of ${order.length} (a section with no usable question is left out)`);
console.log(`SBAs: ${sbaItems}; EMQs: ${emqItems.length} (${Math.round((emqItems.length / picked.length) * 100)}%), each a single scenario`);
const left = order.filter((id) => !picked.some((p) => p.sectionId === id)).map((id) => byId.get(id)?.title);
if (left.length) console.log(`Left out: ${left.join(", ")}`);
console.log(`Questions in all: ${position}; difficulty spread ${JSON.stringify(spread)}`);
for (const p of picked) {
  console.log(`  ${(byId.get(p.sectionId)?.title ?? String(p.sectionId)).padEnd(44)} ${p.kind.padEnd(4)} ${p.ids.map((id) => `${id}(d${difficulty.get(id) ?? "?"})`).join(" ")}`);
}

const template = fs.readFileSync("scripts/phase46-template.sql", "utf8");
const sql = template
  .replace("-- {{GENERATED}}", `-- Generated by scripts/pick-free-diagnostic.mts on ${new Date().toISOString().slice(0, 10)}: ${picked.length} sections, ${sbaItems} SBAs and ${emqItems.length} EMQ scenarios (${position} questions).`)
  .replace("{{ROWS}}", lines.join(",\n"));
fs.writeFileSync("supabase/phase46-free-diagnostic.sql", sql);
console.log("Wrote supabase/phase46-free-diagnostic.sql");
