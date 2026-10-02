/**
 * Put #1856 and #1857 back on one option list.
 *
 *   npx tsx scripts/fix-1856-list-drift.mts
 *   npx tsx scripts/fix-1856-list-drift.mts --apply
 *
 * My em dash pass rewrote each field on its own, and an EMQ stores its
 * option list once per scenario. The same dash came back as a colon in
 * one row and a comma in the other, so a set that must share a list
 * stopped sharing it: "COC pill: avoid; UKMEC 4" against "COC pill,
 * avoid; UKMEC 4". The integrity audit caught it, which is what it is
 * for, and this is the only set it happened to.
 *
 * Both rows now carry the colon form, which is what a label wants. The
 * order never changed, so each scenario keeps the answer it had.
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
const apply = process.argv.includes("--apply");

const OPTIONS = [
  { key: "A", text: "COC pill: avoid; UKMEC 4" },
  { key: "B", text: "COC pill: use with caution; UKMEC 3" },
  {
    key: "C",
    text: "Contraceptive implant: appropriate; INR within therapeutic range required",
  },
  { key: "D", text: "Copper IUD: insert immediately following surgical abortion" },
  {
    key: "E",
    text: "Hysteroscopic sterilisation under local anaesthetic with mild sedation",
  },
  {
    key: "F",
    text: "Injectable progestogen: appropriate despite enzyme-inducing medication",
  },
  {
    key: "G",
    text: "Intrauterine contraceptive: defer insertion until at least 4 weeks postpartum",
  },
  {
    key: "H",
    text: "Intravenous antibiotic prophylaxis prior to intrauterine contraceptive insertion",
  },
  { key: "I", text: "Levonorgestrel IUS: UKMEC 4; avoid" },
  { key: "J", text: "POP: appropriate alternative to combined hormonal contraception" },
];

const { data: rows } = await db
  .from("generated_questions")
  .select("id, correct_key, options")
  .in("id", [1856, 1857])
  .order("id");
if (rows?.length !== 2) throw new Error("expected both scenarios");

for (const row of rows) {
  const options = (row.options ?? []) as { key: string; text: string }[];
  if (options.length !== OPTIONS.length) {
    throw new Error(`#${row.id}: the list is a different length`);
  }
  /* The rows differ only in punctuation, so the order must still match. */
  const bones = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  options.forEach((o, i) => {
    if (bones(o.text) !== bones(OPTIONS[i].text)) {
      throw new Error(`#${row.id}: option ${o.key} is a different option, not a different comma`);
    }
  });
  console.log(`#${row.id}  keeps ${row.correct_key}  ${OPTIONS.find((o) => o.key === row.correct_key)?.text}`);
  if (apply) {
    const { error } = await db
      .from("generated_questions")
      .update({ options: OPTIONS })
      .eq("id", row.id);
    if (error) throw new Error(`#${row.id}: ${error.message}`);
  }
}

console.log(apply ? "\nsaved" : "\nnot saved - pass --apply");
