/**
 * Stems that call a woman gravida or primigravida when she is no longer
 * pregnant.
 *
 *   npx tsx scripts/audit-parity.mts              the pending queue
 *   npx tsx scripts/audit-parity.mts --approved   the approved bank
 *
 * Gravida counts the current pregnancy. Once she has given birth, or
 * between pregnancies, she is "para N" (with "+N" for losses before 24
 * weeks): Q869 was "G1P1" on the postnatal ward and Q1164 "G3P0" in the
 * recurrent miscarriage clinic, and the bank had eight more. A story told
 * from before the birth ("a primigravida delivers vaginally") is
 * listed too, because when the question itself is postnatal it reads
 * better as "delivers her first baby". Every hit is read: "G2P1 at 8
 * weeks after a stillbirth" is correct, and this cannot tell.
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

const status = process.argv.includes("--approved") ? "approved" : "pending";
const rows = await fetchAll<{ id: number; stem: string }>((from, to) =>
  db.from("generated_questions").select("id, stem").eq("status", status).order("id").range(from, to)
);

const gravida = /\b(primigravid\w*|multigravid\w*|G\d+\s*P\d+(\+\d+)?|gravida\s*\d+)/i;
const notPregnant =
  /(post-?partum|postnatal|after (the )?(birth|delivery|her (vaginal|caesarean))|following (a |her )?(vaginal |caesarean )?(delivery|birth)|has delivered|delivers|delivered (a|her|by|at|vaginally)|gave birth|days? after|weeks? after (a |her )?(birth|delivery|caesarean)|pre-?conception|planning (a|her) (first |next )?pregnancy|trying to conceive|wishes to conceive|not pregnant|months after (a|her) (stillbirth|miscarriage|birth|delivery)|following her (\w+ )?(miscarriage|stillbirth))/i;
const stillPregnant = /\bweeks'? (of )?gestation\b|\bweeks pregnant\b|is (now )?pregnant|currently pregnant/i;

let n = 0;
for (const r of rows) {
  const g = gravida.exec(r.stem);
  const p = g && notPregnant.exec(r.stem);
  if (!g || !p) continue;
  if (stillPregnant.test(r.stem) && !/(post-?partum|postnatal|has delivered|gave birth)/i.test(r.stem)) continue;
  n += 1;
  console.log(`Q${r.id}  "${g[0]}" with "${p[0]}"\n  ${r.stem.slice(0, 260).replace(/\n/g, " ")}\n`);
}
console.log(`${n} of ${rows.length} ${status} question(s) to read`);
