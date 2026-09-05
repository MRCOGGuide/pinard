/**
 * Language audit over the bank, using the app's own lints.
 *
 * Deliberately imports the real checks rather than restating their
 * patterns: a hand-copied regex is a second source of truth that can
 * drift from the first, and transcribing one through a shell heredoc
 * silently ate the escapes once already — `\(\s*` arriving as `(s*`,
 * which matches everything and reports a clean bank.
 *
 * The one check written here is the abbreviation rule, because it has
 * no counterpart in generation: the prompt asks for it and nothing
 * enforced it, which is how a stem came to read "tumour HRD testing is
 * negative (HRP)... considered for PARP inhibitor maintenance... the
 * expected PFS benefit" at a reader who is a general obstetrician.
 *
 *   npx tsx scripts/audit-language.mts
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
const {
  ukEnglishProblems,
  sourceNarrationProblems,
  studyAttributionProblems,
  listRecallProblems,
} = await import("../src/lib/generation");
const { EVERYDAY_ABBREVIATIONS, unexpandedAbbreviations } = await import(
  "../src/lib/abbreviations"
);

const db = createAdminClient();
const { data } = await db
  .from("generated_questions")
  .select("id, status, format, stem, lead_in, options, explanations")
  .in("status", ["approved", "pending"])
  .order("id");

type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: { text: string }[];
  explanations: { text: string }[];
};
const rows = (data ?? []) as unknown as Row[];

const counts = {
  ukEnglish: 0,
  narration: 0,
  studyInQuestion: 0,
  listRecall: 0,
  abbreviations: 0,
};
const abbrevTally = new Map<string, number[]>();

for (const q of rows) {
  const asked = [q.stem, q.lead_in ?? "", ...q.options.map((o) => o.text)].join("\n");
  const everything = [asked, ...q.explanations.map((e) => e.text)].join("\n");

  if (ukEnglishProblems(everything).length) counts.ukEnglish++;
  if (sourceNarrationProblems(everything).length) counts.narration++;
  if (studyAttributionProblems(asked).length) counts.studyInQuestion++;
  if (listRecallProblems(q.stem).length) counts.listRecall++;

  const loose = unexpandedAbbreviations(everything);
  if (loose.length) {
    counts.abbreviations++;
    for (const a of loose) {
      if (!abbrevTally.has(a)) abbrevTally.set(a, []);
      abbrevTally.get(a)!.push(q.id);
    }
  }
}

console.log(`${rows.length} approved/pending questions\n`);
console.log(`  UK-English slips ................... ${counts.ukEnglish}`);
console.log(`  narrate the source or a location ... ${counts.narration}`);
console.log(`  name evidence in the question ...... ${counts.studyInQuestion}`);
console.log(`  ask which item is listed ........... ${counts.listRecall}`);
console.log(`  unexpanded abbreviations ........... ${counts.abbreviations}`);

if (abbrevTally.size > 0) {
  console.log(
    `\nabbreviations outside the everyday ${EVERYDAY_ABBREVIATIONS.size} that are never written out:`
  );
  const sorted = [...abbrevTally.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [abbr, ids] of sorted.slice(0, 25)) {
    console.log(
      `  ${abbr.padEnd(10)} ${String(ids.length).padStart(3)} question(s)  ${ids.slice(0, 10).join(", ")}${ids.length > 10 ? "…" : ""}`
    );
  }
}
