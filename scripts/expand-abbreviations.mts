/**
 * Write out the abbreviations a general trainee would not read.
 *
 * The narrowest of the repair passes: the scenario, the medicine, the
 * numbers and the answer all stay: only the first appearance of a short
 * form changes, gaining its expansion and keeping the short form in
 * brackets. Everything after it stays short.
 *
 * Two things make this less simple than a find-and-replace.
 *
 *   1. An EMQ set shares one option list across its scenarios, so the
 *      set is expanded as a unit and written back to every row in it.
 *      Row by row would letter and word the same list differently under
 *      each scenario.
 *
 *   2. Expanding an option changes its text, and options are stored in
 *      alphabetical order — "PARP inhibitor" sorts nowhere near "poly
 *      (ADP-ribose) polymerase (PARP) inhibitor". So the list is
 *      re-ordered afterwards through the same function generation uses,
 *      and the answer key and explanation keys are remapped with it.
 *
 * Guarded at both ends: the model may not change how many options there
 * are, which letters they carry, or which is correct, and the result
 * goes back through the same grounding check and lints a new question
 * faces. Anything that fails is left exactly as it was.
 *
 *   npx tsx scripts/expand-abbreviations.mts --dry
 *   npx tsx scripts/expand-abbreviations.mts --id 128
 *   npx tsx scripts/expand-abbreviations.mts
 */

import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

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
const { getChunksByIds } = await import("../src/lib/retrieval");
const {
  checkGrounding,
  extractJson,
  formatPassages,
  orderOptions,
  ukEnglishProblems,
  sourceNarrationProblems,
} = await import("../src/lib/generation");
const { unexpandedAbbreviations } = await import("../src/lib/abbreviations");
const { PROMPT_G, PROMPT_X } = await import("../src/lib/prompts");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY = (() => {
  const i = args.indexOf("--id");
  return i >= 0 ? Number(args[i + 1]) : null;
})();

const db = createAdminClient();
const client = new Anthropic();
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

type Option = { key: string; text: string };
type Explanation = {
  key: string;
  verdict: string;
  text: string;
  citation_chunk_ids: number[];
  source_reference?: string;
};
type Row = {
  id: number;
  status: string;
  format: string;
  stem: string;
  lead_in: string | null;
  options: Option[];
  correct_key: string;
  explanations: Explanation[];
  emq_group_id: string | null;
};

let query = db
  .from("generated_questions")
  .select(
    "id, status, format, stem, lead_in, options, correct_key, explanations, emq_group_id"
  )
  .in("status", ["approved", "pending"])
  .order("id");
if (ONLY !== null) query = query.eq("id", ONLY);
const { data } = await query;
const rows = (data ?? []) as unknown as Row[];

/** One unit of work: an SBA, or a whole EMQ set. */
const units = new Map<string, Row[]>();
for (const r of rows) {
  const key = r.emq_group_id ? `set:${r.emq_group_id}` : `q:${r.id}`;
  (units.get(key) ?? units.set(key, []).get(key)!).push(r);
}

const textOf = (r: Row) =>
  [r.stem, r.lead_in ?? "", ...r.options.map((o) => o.text), ...r.explanations.map((e) => e.text)]
    .filter(Boolean)
    .join("\n");

let fixed = 0;
let skipped = 0;
let left = 0;

for (const [, members] of units) {
  members.sort((a, b) => a.id - b.id);
  const loose = Array.from(
    new Set(members.flatMap((r) => unexpandedAbbreviations(textOf(r))))
  );
  if (loose.length === 0) {
    skipped++;
    continue;
  }

  const first = members[0];
  const correct = first.explanations.find((e) => e.key === first.correct_key);
  const passages = correct ? await getChunksByIds(correct.citation_chunk_ids) : [];

  // One call per row; an EMQ set's shared option list is taken from its
  // first scenario and applied to the rest.
  let sharedOptions: Option[] | null = null;
  const updates: { row: Row; stem: string; leadIn: string | null; options: Option[]; explanation: string }[] = [];
  let unitFailed = false;

  for (const row of members) {
    const rowExplanation =
      row.explanations.find((e) => e.key === row.correct_key)?.text ?? "";

    const user = [
      `SHORT FORMS TO WRITE OUT: ${loose.join(", ")}`,
      `STEM:\n${row.stem}`,
      row.lead_in ? `LEAD-IN:\n${row.lead_in}` : "LEAD-IN:\nnull",
      `OPTIONS:\n${row.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`,
      `CORRECT OPTION: ${row.correct_key}`,
      `EXPLANATION:\n${rowExplanation}`,
      passages.length ? `SOURCE PASSAGES:\n${formatPassages(passages)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let parsed: {
      stem?: unknown;
      lead_in?: unknown;
      options?: unknown;
      explanation?: unknown;
      unchanged?: unknown;
    } | null = null;
    let problems: string[] = ["not attempted"];

    for (let attempt = 0; attempt < 3 && problems.length > 0; attempt++) {
      const res = await client.messages.create({
        model,
        max_tokens: 2000,
        system: PROMPT_G + "\n\n" + PROMPT_X,
        messages: [
          {
            role: "user",
            content:
              attempt === 0
                ? user
                : `${user}\n\nYour previous attempt was rejected for: ${problems.join("; ")}. Try again.`,
          },
        ],
      });
      const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
      try {
        parsed = JSON.parse(extractJson(raw));
      } catch {
        problems = ["response was not JSON"];
        continue;
      }
      if (parsed?.unchanged === true) {
        problems = [];
        break;
      }

      const stem = typeof parsed?.stem === "string" ? parsed.stem.trim() : "";
      const opts = Array.isArray(parsed?.options)
        ? (parsed.options as Option[]).filter(
            (o) => o && typeof o.key === "string" && typeof o.text === "string"
          )
        : [];
      const expl =
        typeof parsed?.explanation === "string" ? parsed.explanation.trim() : "";

      problems = [];
      if (!stem) problems.push("empty stem");
      // The shape is the contract: same count, same letters, same answer.
      if (opts.length !== row.options.length) {
        problems.push(
          `returned ${opts.length} options where the question has ${row.options.length}`
        );
      } else if (
        opts.some((o, i) => o.key !== row.options[i].key)
      ) {
        problems.push("option letters were changed");
      }
      if (!opts.some((o) => o.key === row.correct_key)) {
        problems.push("the correct option is missing");
      }
      // Expansion adds words; it never removes half the question.
      const before = textOf(row).length;
      const after = [stem, ...opts.map((o) => o.text), expl].join("\n").length;
      if (after < before * 0.85) problems.push("the text shrank — content was lost");
      if (after > before * 2) problems.push("the text doubled — more than expansion happened");

      const all = [stem, ...opts.map((o) => o.text), expl].join("\n");
      problems.push(...ukEnglishProblems(all));
      problems.push(...sourceNarrationProblems(all));
    }

    if (problems.length > 0 || !parsed) {
      console.log(`  ${row.id}: LEFT — ${problems.join("; ")}`);
      unitFailed = true;
      break;
    }
    if (parsed.unchanged === true) {
      updates.push({
        row,
        stem: row.stem,
        leadIn: row.lead_in,
        options: row.options,
        explanation:
          row.explanations.find((e) => e.key === row.correct_key)?.text ?? "",
      });
      continue;
    }

    const opts = parsed.options as Option[];
    sharedOptions ??= opts;
    updates.push({
      row,
      stem: String(parsed.stem).trim(),
      leadIn:
        typeof parsed.lead_in === "string" && parsed.lead_in.trim() !== "null"
          ? parsed.lead_in.trim()
          : row.lead_in,
      // A set shares one list, taken from the first scenario.
      options: row.emq_group_id ? sharedOptions : opts,
      explanation: String(parsed.explanation ?? "").trim(),
    });
  }

  if (unitFailed) {
    left++;
    continue;
  }

  // Re-letter: an expanded option sorts somewhere else entirely.
  const { options: ordered, remap } = orderOptions(updates[0].options);

  for (const u of updates) {
    const correctKey = remap.get(u.row.correct_key) ?? u.row.correct_key;
    const explanations = u.row.explanations.map((e) => ({
      ...e,
      key: remap.get(e.key) ?? e.key,
      text: e.key === u.row.correct_key && u.explanation ? u.explanation : e.text,
    }));

    // Still answerable, still by the same option.
    if (passages.length > 0) {
      const candidate = { ...u.row, stem: u.stem, options: ordered, correct_key: correctKey, explanations };
      const grounding = await checkGrounding(candidate as never, passages as never, client, model);
      if (!grounding.ok) {
        console.log(`  ${u.row.id}: LEFT — fails grounding after expansion: ${grounding.reason}`);
        left++;
        continue;
      }
    }

    const stillLoose = unexpandedAbbreviations(
      [u.stem, u.leadIn ?? "", ...ordered.map((o) => o.text), ...explanations.map((e) => e.text)].join("\n")
    );

    console.log(`\n  ${u.row.id} (${u.row.format}/${u.row.status})  ${loose.join(", ")}`);
    console.log(`    was: ${u.row.stem.slice(0, 420)}`);
    console.log(`    now: ${u.stem.slice(0, 420)}`);
    if (stillLoose.length) console.log(`    still short: ${stillLoose.join(", ")}`);

    if (!DRY) {
      const { error } = await db
        .from("generated_questions")
        .update({
          stem: u.stem,
          lead_in: u.leadIn,
          options: ordered,
          correct_key: correctKey,
          explanations,
        })
        .eq("id", u.row.id);
      if (error) {
        console.log(`    WRITE FAILED — ${error.message}`);
        left++;
        continue;
      }
    }
    fixed++;
  }
}

console.log(
  `\n${DRY ? "would expand" : "expanded"} ${fixed}, left alone ${left}, already clear ${skipped}`
);
