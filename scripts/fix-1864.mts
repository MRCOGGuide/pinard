/**
 * #1864 inverted a sentence of its source into nonsense.
 *
 *   npx tsx scripts/fix-1864.mts
 *   npx tsx scripts/fix-1864.mts --apply
 *
 * The card ended "TOA accounts for only 1.7% of all tubo-ovarian
 * abscesses (TOAs) in postmenopausal women", which says that a
 * tubo-ovarian abscess is 1.7% of tubo-ovarian abscesses. The source
 * says the opposite way round: "TOAs in postmenopausal women are rare,
 * with an incidence of 1.7% of all TOAs." It also expands an
 * abbreviation it has already used twice.
 *
 * Found while scanning for figures that rest on one small study, which
 * is what the rest of this card is: Protopapas et al. and 47%. That
 * part stays, the figure driving a threshold a registrar acts on.
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
const { selfTalkProblems, ukEnglishProblems, emDashProblems } = await import(
  "../src/lib/generation"
);

const db = createAdminClient();
const apply = process.argv.includes("--apply");

const FROM =
  " TOA accounts for only 1.7% of all tubo-ovarian abscesses (TOAs) in postmenopausal women.";
const TO =
  " The abscess itself is rare after the menopause: postmenopausal women account for 1.7% of all TOAs.";
const GROUND = "TOAs in postmenopausal women are rare, with an incidence of 1.7% of all TOAs";

const { data: row } = await db
  .from("generated_questions")
  .select("id, status, correct_key, explanations, citation_chunk_ids")
  .eq("id", 1864)
  .single();
if (!row) throw new Error("no question 1864");

const cites = new Set<number>((row.citation_chunk_ids ?? []) as number[]);
for (const e of (row.explanations ?? []) as { citation_chunk_ids?: number[] }[]) {
  for (const id of e.citation_chunk_ids ?? []) cites.add(id);
}
const { data: chunks, error: chunkError } = await db
  .from("content_chunks")
  .select("id, text")
  .in("id", [...cites]);
if (chunkError) throw chunkError;
const passage = (chunks ?? [])
  .map((c) => (c.text as string) ?? "")
  .join("\n")
  .replace(/\s+/g, " ");
if (!passage.includes(GROUND)) throw new Error("the passages no longer carry the figure");

const problems = [...selfTalkProblems(TO), ...ukEnglishProblems(TO), ...emDashProblems(TO)];
if (problems.length) throw new Error(problems.join("; "));

const list = (row.explanations ?? []) as { key: string; text: string }[];
const answer = list.find((e) => e.key === row.correct_key);
if (!answer?.text.includes(FROM)) throw new Error("the sentence has changed");

console.log(`#1864 ${row.status}`);
console.log(`   - ${FROM.trim()}`);
console.log(`   + ${TO.trim()}`);

if (apply) {
  const { error } = await db
    .from("generated_questions")
    .update({
      explanations: list.map((e) =>
        e.key === row.correct_key ? { ...e, text: e.text.replace(FROM, TO) } : e
      ),
    })
    .eq("id", 1864);
  if (error) throw error;
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
