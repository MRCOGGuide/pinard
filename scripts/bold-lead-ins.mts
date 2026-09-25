/**
 * Put the theme of every EMQ lead-in in bold.
 *
 *   npx tsx scripts/bold-lead-ins.mts --dry
 *   npx tsx scripts/bold-lead-ins.mts
 *
 * A lead-in is boilerplate wrapped around one phrase that says what the
 * set is about. Under exam conditions that phrase is the hardest part to
 * find, because it sits mid-sentence in an opening every other set
 * shares. Marking it — "relates to **fertility treatment using donor
 * gametes or embryos in the UK**" — picks it out at a glance.
 *
 * Deterministic, not a model call: 391 of 393 lead-ins open with "Each
 * of the following … relates to", and the theme runs from there to the
 * end of that sentence. Anything that does not match a known shape is
 * left alone and reported, because a mangled lead-in is worse than an
 * unbolded one.
 *
 * Safe to re-run: a lead-in already carrying ** is skipped, so this can
 * be run again over a later batch.
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

const dry = process.argv.includes("--dry");

type Row = {
  id: number;
  status?: string;
  lead_in: string | null;
  emq_group_id: string | null;
};

const rows = await fetchAll<Row>((from, to) =>
  db
    .from("generated_questions")
    .select("id, status, lead_in, emq_group_id")
    .eq("format", "emq")
    .order("id")
    .range(from, to)
);

/**
 * Wrap the theme, or return null if this lead-in is not a shape we know.
 *
 * Two shapes are in the bank. The common one states the theme and then
 * instructs; the other folds both into one sentence, where the theme
 * ends at the comma before "choose".
 */
export function boldTheme(text: string): string | null {
  if (text.includes("**")) return null;

  const stated = text.match(
    /^(Each of the following (?:clinical )?(?:scenarios|vignettes|cases) relates? to )(.+?)(\.\s|\.$)/i
  );
  if (stated) {
    const [, opener, theme, stop] = stated;
    return text.replace(opener + theme + stop, `${opener}**${theme.trim()}**${stop}`);
  }

  const folded = text.match(
    /^(For each of the following (?:clinical )?(?:scenarios|vignettes|cases) relating to )(.+?)(,\s)/i
  );
  if (folded) {
    const [, opener, theme, stop] = folded;
    return text.replace(opener + theme + stop, `${opener}**${theme.trim()}**${stop}`);
  }

  return null;
}

/* One lead-in per set: every scenario in a group shows the same one. */
const groups = new Map<string, Row[]>();
const loose: Row[] = [];
for (const r of rows) {
  if (!r.lead_in?.trim()) continue;
  if (!r.emq_group_id) {
    loose.push(r);
    continue;
  }
  const list = groups.get(r.emq_group_id);
  if (list) list.push(r);
  else groups.set(r.emq_group_id, [r]);
}

let bolded = 0;
let already = 0;
const unmatched: Row[] = [];

async function handle(rowsForLeadIn: Row[], groupId: string | null) {
  const first = rowsForLeadIn[0];
  const text = first.lead_in as string;
  if (text.includes("**")) {
    already++;
    return;
  }
  const next = boldTheme(text);
  if (!next) {
    unmatched.push(first);
    return;
  }
  bolded++;
  if (bolded <= 5) {
    const theme = next.match(/\*\*(.+?)\*\*/)?.[1] ?? "";
    console.log(`#${first.id} (${first.status}) theme: ${theme}`);
  }
  if (!dry) {
    const query = db.from("generated_questions").update({ lead_in: next });
    const { error } = groupId
      ? await query.eq("emq_group_id", groupId)
      : await query.eq("id", first.id);
    if (error) throw new Error(`#${first.id}: ${error.message}`);
  }
}

for (const [groupId, set] of groups) await handle(set, groupId);
for (const row of loose) await handle([row], null);

/*
  The exemplars too. They are shown to the generator as the style to
  follow, so leaving them unmarked would put the instruction and the
  examples in disagreement — and the examples win.
*/
const examples = await fetchAll<Row>((from, to) =>
  db
    .from("example_questions")
    .select("id, lead_in, emq_group_id")
    .eq("format", "emq")
    .order("id")
    .range(from, to)
);
const exampleGroups = new Map<string, Row[]>();
for (const r of examples) {
  if (!r.lead_in?.trim() || !r.emq_group_id) continue;
  const list = exampleGroups.get(r.emq_group_id);
  if (list) list.push(r);
  else exampleGroups.set(r.emq_group_id, [r]);
}
for (const [groupId, set] of exampleGroups) {
  const first = set[0];
  const text = first.lead_in as string;
  if (text.includes("**")) {
    already++;
    continue;
  }
  const next = boldTheme(text);
  if (!next) {
    unmatched.push(first);
    continue;
  }
  bolded++;
  if (!dry) {
    const { error } = await db
      .from("example_questions")
      .update({ lead_in: next })
      .eq("emq_group_id", groupId);
    if (error) throw new Error(`example #${first.id}: ${error.message}`);
  }
}
console.log(`(${exampleGroups.size} exemplar set(s) considered)`);

console.log(
  `\n${bolded} lead-in(s) ${dry ? "would be" : ""} bolded, ${already} already marked, ${unmatched.length} left alone`
);
for (const u of unmatched) {
  console.log(`  #${u.id} (${u.status}) ${u.lead_in?.slice(0, 110)}`);
}
