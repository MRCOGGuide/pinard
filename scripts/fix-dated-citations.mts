/**
 * Take the publication year out of the question.
 *
 *   npx tsx scripts/fix-dated-citations.mts
 *   npx tsx scripts/fix-dated-citations.mts --apply
 *
 * "According to ESHRE 2022 guidance", "the 2023 BASHH guideline", "the
 * RCOG 2011 regimen": naming the body is fine and often accurate, but
 * the year stamps an edition into prose that outlives it. When the
 * next edition lands, the question is either wrong or quaint, and
 * nothing in the bank knows to go and look.
 *
 * #1985 is a different case in the same sentence: "Semen analysis is
 * normal by WHO 2010 criteria" — its source says only that semen
 * analysis is normal, so the edition was never grounded in anything.
 *
 * #1228 keeps its year on purpose. "According to the RCOG 2024 core
 * curriculum" is a question about that curriculum, and the year is the
 * content rather than a citation.
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
const { sourceNarrationProblems } = await import("../src/lib/generation");

const db = createAdminClient();
const apply = process.argv.includes("--apply");

type Edit = {
  id: number;
  field: "stem" | "explanation";
  from: string;
  to: string;
};

const EDITS: Edit[] = [
  { id: 411, field: "stem", from: "ESHRE 2022 guidance", to: "ESHRE guidance" },
  { id: 412, field: "stem", from: "ESHRE 2022 guidance", to: "ESHRE guidance" },
  { id: 413, field: "stem", from: "ESHRE 2022 guidance", to: "ESHRE guidance" },
  { id: 418, field: "stem", from: "ESHRE 2022 guidance", to: "ESHRE guidance" },
  { id: 781, field: "stem", from: "the 2023 BASHH guideline", to: "the BASHH guideline" },
  { id: 1164, field: "explanation", from: "the RCOG 2011 regimen", to: "the RCOG regimen" },
  { id: 1985, field: "stem", from: "normal by WHO 2010 criteria", to: "normal" },
  { id: 1985, field: "stem", from: "According to NICE 2013 guidance, what", to: "What" },
];

for (const edit of EDITS) {
  const { data: row } = await db
    .from("generated_questions")
    .select("id, stem, correct_key, explanations")
    .eq("id", edit.id)
    .single();
  if (!row) throw new Error(`#${edit.id}: not found`);

  if (edit.field === "stem") {
    const before = row.stem as string;
    if (!before.includes(edit.from)) {
      console.log(`#${edit.id} stem: already done`);
      continue;
    }
    const after = before.replace(edit.from, edit.to);
    const problems = sourceNarrationProblems(after);
    if (problems.length) throw new Error(`#${edit.id}: ${problems[0]}`);
    console.log(`#${edit.id} stem: ${edit.from} → ${edit.to}`);
    if (apply) {
      const { error } = await db
        .from("generated_questions")
        .update({ stem: after })
        .eq("id", edit.id);
      if (error) throw new Error(`#${edit.id}: ${error.message}`);
    }
  } else {
    const explanations = (row.explanations ?? []) as { key: string; text: string }[];
    const current = explanations.find((e) => e.key === row.correct_key);
    if (!current?.text.includes(edit.from)) {
      console.log(`#${edit.id} explanation: already done`);
      continue;
    }
    const after = current.text.replace(edit.from, edit.to);
    const problems = sourceNarrationProblems(after);
    if (problems.length) throw new Error(`#${edit.id}: ${problems[0]}`);
    console.log(`#${edit.id} explanation: ${edit.from} → ${edit.to}`);
    if (apply) {
      const { error } = await db
        .from("generated_questions")
        .update({
          explanations: explanations.map((e) =>
            e.key === row.correct_key ? { ...e, text: after } : e
          ),
        })
        .eq("id", edit.id);
      if (error) throw new Error(`#${edit.id}: ${error.message}`);
    }
  }
}

console.log(apply ? "\nsaved" : "\nnot saved — pass --apply");
