/**
 * Questions whose answer belongs to a moment the stem has already passed.
 *
 *   npx tsx scripts/audit-timing.mts
 *
 * A grounding check asks whether the answer is supported by the source.
 * It cannot ask whether the scenario still allows it. #1240 cited
 * "transverse abdominus plane blocks at CS should be considered" — true,
 * and properly cited — under a stem set 18 hours after the caesarean,
 * by which time a block "at CS" is not among the options available to
 * anyone. Both halves were right and the question was still unanswerable.
 *
 * This looks for the shape of that mistake: a correct option anchored to
 * an event, under a stem that has moved past it. Heuristic, so every hit
 * needs reading — it flags the pairing, it does not judge the medicine.
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

/** An option tied to a moment during or before the operation. */
const ANCHORED =
  /\b(at|during|before)\s+(the\s+)?(cs|caesarean|c-section|delivery|surgery|operation|induction|intubation)\b|\bintra-?operative\w*\b|\bat the time of (delivery|surgery|caesarean)\b|\bprior to (delivery|surgery|incision)\b/i;

/** A stem that has already moved past it. */
const AFTER =
  /\b(\d+\s*(hours?|days?|weeks?)\s+(post-?partum|post-?operative\w*|after (delivery|the caesarean|surgery)))|\bnow\s+\d+\s*(hours?|days?)\b|\bon day \d+ (post-?partum|post-?operative\w*)|\bis now\b[^.]{0,40}\bpost-?partum\b|\bhas (since|already) (been delivered|delivered)\b/i;

type Row = {
  id: number;
  format: string;
  status: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from("generated_questions")
    .select("id, format, status, stem, options, correct_key")
    .in("status", ["approved", "pending"])
    .range(from, from + 999);
  const page = (data ?? []) as unknown as Row[];
  all.push(...page);
  if (page.length < 1000) break;
}

let flagged = 0;
for (const q of all) {
  const answer = (q.options ?? []).find((o) => o.key === q.correct_key);
  if (!answer) continue;
  const anchor = answer.text.match(ANCHORED);
  const later = q.stem.match(AFTER);
  if (!anchor || !later) continue;
  flagged++;
  console.log(`\n#${q.id}  ${q.format}/${q.status}`);
  console.log(`  answer ${q.correct_key}: ${answer.text}`);
  console.log(`  anchored to: "${anchor[0]}"   stem has moved to: "${later[0]}"`);
  console.log(`  stem: …${q.stem.replace(/\s+/g, " ").slice(-170)}`);
}

console.log(
  `\n${flagged} of ${all.length} approved or pending questions pair a moment-anchored answer` +
    `\nwith a stem past that moment. Each needs reading; the pairing is a smell, not a verdict.`
);
