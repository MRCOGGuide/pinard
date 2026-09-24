/**
 * Print a whole EMQ set — lead-in, shared option list, every scenario.
 *
 *   npx tsx scripts/show-set.mts 1489
 *
 * show.mts prints one row, which for an EMQ is one scenario against a
 * list it shares with its siblings. A set only makes sense whole: the
 * option list has to be read against every scenario answered from it.
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

for (const arg of process.argv.slice(2)) {
  const { data: seed } = await db
    .from("generated_questions")
    .select("*")
    .eq("id", Number(arg))
    .single();
  if (!seed) {
    console.log(`no question ${arg}`);
    continue;
  }
  const rows = seed.emq_group_id
    ? (
        await db
          .from("generated_questions")
          .select("*")
          .eq("emq_group_id", seed.emq_group_id)
          .order("id")
      ).data ?? [seed]
    : [seed];

  const answers = new Set(rows.map((r) => r.correct_key));
  console.log("=".repeat(72));
  console.log(
    `#${arg}  ${seed.format}  group=${seed.emq_group_id ?? "-"}  section=${seed.section_id}  docs=${JSON.stringify(seed.source_document_ids)}`
  );
  console.log(`LEAD-IN: ${rows[0].lead_in ?? "-"}\n`);
  console.log("OPTIONS:");
  for (const o of (rows[0].options ?? []) as { key: string; text: string }[]) {
    console.log(`  ${o.key}. ${o.text}${answers.has(o.key) ? "   <== used" : ""}`);
  }
  for (const r of rows) {
    console.log(
      `\n--- #${r.id} ${r.status} difficulty ${r.difficulty}/5 answer ${r.correct_key} ---`
    );
    console.log(r.stem);
    for (const e of (r.explanations ?? []) as {
      key: string;
      text: string;
      citation_chunk_ids?: number[];
    }[]) {
      console.log(`  [${e.key}] ${e.text}  cites=${JSON.stringify(e.citation_chunk_ids)}`);
    }
  }
  console.log();
}
