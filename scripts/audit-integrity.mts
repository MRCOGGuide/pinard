/**
 * Structural faults that make a question unanswerable or unmarkable.
 *
 *   npx tsx scripts/audit-integrity.mts
 *
 * Cheap, local, and worth running after anything that renumbers an
 * option list: an answer key that names no option, an explanation keyed
 * to an option that is not there, a set whose scenarios disagree about
 * what the shared list is, duplicate keys, duplicate option text.
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

type Row = {
  id: number;
  status: string;
  format: string;
  correct_key: string;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  emq_group_id: string | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, format, correct_key, options, explanations, emq_group_id")
    .in("status", ["approved", "pending"])
    .order("id")
    .range(from, to)
);

const faults: string[] = [];

for (const r of rows) {
  const options = r.options ?? [];
  const keys = options.map((o) => o.key);
  const keySet = new Set(keys);

  if (options.length === 0) faults.push(`#${r.id} has no options`);
  if (keySet.size !== keys.length) faults.push(`#${r.id} has a repeated option key`);
  if (!keySet.has(r.correct_key)) {
    faults.push(`#${r.id} answer ${r.correct_key} names no option`);
  }
  const texts = options.map((o) => o.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) {
    faults.push(`#${r.id} has two options with the same text`);
  }
  // Keys should run A, B, C… without a gap, which is how they are shown.
  const expected = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, options.length).split("");
  if (keys.join("") !== expected.join("")) {
    faults.push(`#${r.id} keys are ${keys.join("")}, expected ${expected.join("")}`);
  }
  for (const e of r.explanations ?? []) {
    if (!keySet.has(e.key)) {
      faults.push(`#${r.id} explains option ${e.key}, which is not in its list`);
    }
  }
}

/* Every scenario of a set is answered from one list; they must agree. */
const sets = new Map<string, Row[]>();
for (const r of rows) {
  if (r.format !== "emq" || !r.emq_group_id) continue;
  const list = sets.get(r.emq_group_id);
  if (list) list.push(r);
  else sets.set(r.emq_group_id, [r]);
}
for (const [, set] of sets) {
  const shape = (r: Row) =>
    JSON.stringify((r.options ?? []).map((o) => [o.key, o.text]));
  const first = shape(set[0]);
  const odd = set.filter((r) => shape(r) !== first);
  if (odd.length) {
    faults.push(
      `set #${set[0].id} — ${odd.map((r) => `#${r.id}`).join(", ")} show a different option list from #${set[0].id}`
    );
  }
}

console.log(`${rows.length} approved/pending questions, ${sets.size} EMQ sets\n`);
if (faults.length === 0) console.log("no structural faults");
else {
  console.log(`${faults.length} fault(s):`);
  for (const f of faults.slice(0, 60)) console.log(`  ${f}`);
  if (faults.length > 60) console.log(`  … and ${faults.length - 60} more`);
}
