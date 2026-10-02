/**
 * A figure answer that rests on one named study.
 *
 *   npx tsx scripts/audit-study-figures.mts
 *
 * #2000 asked what proportion of women needed no further surgery
 * after magnetic resonance-guided focused ultrasound, answer 69%, and
 * the reviewer's note was "that sounds like a small trial result". It
 * was: telephone interviews at 33 months with 81 women. The prompt
 * already says an explanation may name only a landmark study the
 * recommendation rests on, never a small cohort cited in passing; this
 * is the same rule turned on the ANSWER, which is the worse place for
 * it, because a candidate has to carry the number out of the room.
 *
 * Deterministic. It takes every question whose answer is a bare figure
 * and asks whether the explanation attributes it to a study, by name,
 * as one study, or as a case series, and prints the smallest number of
 * women the card mentions so the size is visible.
 *
 * Not every hit is a fault. A meta-analysis is an evidence base, not a
 * small cohort, and a figure that drives a threshold a registrar acts
 * on earns its place even from a single series: #1864's 47% of
 * postmenopausal tubo-ovarian abscesses with an underlying malignancy
 * is why the threshold for surgery is lower, and that is worth
 * knowing. What does not earn its place is a number from one survey
 * about a technique NICE restricts to research, which is what #2000
 * was. Read them.
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { fetchAll } = await import("../src/lib/supabase/all");
const db = createAdminClient();
const rows = await fetchAll<any>((f, t) => db.from("generated_questions")
  .select("id, status, correct_key, options, explanations, explanation").neq("status", "rejected").order("id").range(f, t));

const STUDY = /\bet al\b|\bin one study\b|\ba (?:single|small)[- ](?:centre|center|study|series|cohort)\b|\bcase series\b|\btelephone (?:interview|follow)/i;
const FIGURE = /^\s*(?:approximately |about |up to |around )?(?:\d+(?:[.,]\d+)?\s*(?:%|per \d|in \d[\d ]*)|\d+(?:[.,]\d+)?\s*(?:–|-|to)\s*\d+(?:[.,]\d+)?\s*%)\s*$/i;
let n = 0;
for (const r of rows) {
  const ans = ((r.options ?? []) as any[]).find((o) => o.key === r.correct_key)?.text ?? "";
  if (!FIGURE.test(ans)) continue;
  const expl = ((r.explanations ?? []) as any[]).find((e) => e.key === r.correct_key)?.text ?? r.explanation ?? "";
  if (!STUDY.test(expl)) continue;
  /* How many people the figure rests on, if the card says. */
  const sizes = [...expl.matchAll(/\b(\d[\d ,]{1,6})\s*(?:women|patients|participants|cases|pregnancies)\b/gi)]
    .map((m) => Number(m[1].replace(/[ ,]/g, "")));
  const smallest = sizes.length ? Math.min(...sizes) : null;
  n += 1;
  console.log(`#${r.id} ${r.status}  answer ${ans}${smallest !== null ? `  n=${smallest}` : "  n not stated"}`);
  console.log(`   ${expl.replace(/\s+/g, " ").slice(0, 170)}`);
}
console.log(`\n${rows.length} read, ${n} figure answer(s) resting on a named study`);
