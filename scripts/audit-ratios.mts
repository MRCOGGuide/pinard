/**
 * A plain-English gloss that disagrees with its own ratio.
 *
 * Question 1193 offered "1.8 times greater (HR 1.84)" — 1.84 is not
 * 1.8, and an HR of 1.84 is 84% greater, not 180%. Both readings were
 * in one option, disagreeing with each other, in a question whose
 * whole point was reading a hazard ratio.
 *
 * Checks two things wherever a ratio and a gloss sit close together:
 *   "N times/fold"  should equal the ratio
 *   "N% higher"     should equal (ratio - 1) x 100
 *
 *   npx tsx scripts/audit-ratios.mts
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
  options: { key: string; text: string }[] | null;
  explanations: { key: string; text: string }[] | null;
  explanation: string | null;
};

const all: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("generated_questions")
    .select("id, status, stem, options, explanations, explanation")
    .neq("status", "rejected")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  all.push(...(data as unknown as Row[]));
  if (data.length < 1000) break;
}

const RATIO = /\b(?:a?HR|a?OR|a?RR|hazard ratio|odds ratio|relative risk|risk ratio)\s*(?:of|=|was|is)?\s*(\d+(?:\.\d+)?)/gi;
const TIMES = /(\d+(?:\.\d+)?)[\s-]*(?:times|fold)\b/i;
const PERCENT = /(\d+(?:\.\d+)?)\s*%\s*(?:higher|greater|increase|more|lower|reduction|less)/i;

type Finding = { id: number; status: string; kind: string; detail: string };
const findings: Finding[] = [];

for (const q of all) {
  const fields: [string, string][] = [
    ["stem", q.stem ?? ""],
    ...((q.options ?? []).map((o) => [`option ${o.key}`, o.text]) as [string, string][]),
    ...((q.explanations ?? []).map((e) => [`explanation ${e.key}`, e.text ?? ""]) as [string, string][]),
    ["explanation", q.explanation ?? ""],
  ];
  for (const [where, text] of fields) {
    if (!text) continue;
    const re = new RegExp(RATIO.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const ratio = Number(m[1]);
      if (!Number.isFinite(ratio) || ratio <= 0) continue;
      // The gloss sits either just before the ratio or just after it.
      const before = text.slice(Math.max(0, m.index - 70), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 70);
      const window = before + " ||| " + after;

      const t = before.match(TIMES) ?? after.match(TIMES);
      if (t) {
        const claimed = Number(t[1]);
        if (Math.abs(claimed - ratio) > 0.15)
          findings.push({
            id: q.id,
            status: q.status,
            kind: "TIMES-VS-RATIO",
            detail: `${where}: "${t[0]}" beside ${m[0]} — ${claimed} vs ${ratio}   …${window.replace(/\s+/g, " ").trim()}…`,
          });
      }

      const p = before.match(PERCENT) ?? after.match(PERCENT);
      if (p) {
        const claimed = Number(p[1]);
        const implied = Math.abs(ratio - 1) * 100;
        if (Math.abs(claimed - implied) > 2)
          findings.push({
            id: q.id,
            status: q.status,
            kind: "PERCENT-VS-RATIO",
            detail: `${where}: "${p[0]}" beside ${m[0]} — ratio implies ${implied.toFixed(0)}%   …${window.replace(/\s+/g, " ").trim()}…`,
          });
      }
    }
  }
}

console.log(`checked ${all.length} questions\n`);
for (const kind of ["TIMES-VS-RATIO", "PERCENT-VS-RATIO"]) {
  const hits = findings.filter((f) => f.kind === kind);
  console.log(`${kind} — ${hits.length}`);
  for (const h of hits) console.log(`   #${h.id} (${h.status})  ${h.detail}`);
  console.log();
}
if (!findings.length) console.log("clean.");
