/**
 * Which questions use a term. npx tsx scripts/find-term.mts CGA SDM
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

type Row = {
  id: number;
  status: string;
  stem: string;
  lead_in: string | null;
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, stem, lead_in, options, explanations, explanation")
    .neq("status", "rejected")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

function textOf(q: Row): string {
  return [
    q.stem ?? "",
    q.lead_in ?? "",
    ...(q.options ?? []).map((o) => o.text),
    ...(q.explanations ?? []).map((e) => e.text ?? ""),
    q.explanation ?? "",
  ].join("\n");
}

for (const term of process.argv.slice(2)) {
  const re = new RegExp("\\b" + term + "s?\\b");
  const hits = all.filter((q) => re.test(textOf(q)));
  console.log(`\n${term} — ${hits.length} question(s)`);
  for (const q of hits) {
    const t = textOf(q);
    const m = t.match(new RegExp("[^\\n]{0,70}\\b" + term + "s?\\b[^\\n]{0,70}"));
    console.log(`   #${q.id} (${q.status})  …${m ? m[0].trim() : ""}…`);
  }
}
