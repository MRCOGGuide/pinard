/**
 * Turn the fact audit, the support search and a person's decisions into
 * the two inputs the repair tools take.
 *
 *   npx tsx scripts/build-fact-repairs.mts [--keys q-5,set-...]
 *
 * Reads .review/facts/, .review/support/ and .review/fact-decisions.json;
 * writes .review/fact-faults.json (for repair-queue --faults) and
 * .review/citation-plan.json (for add-citations --plan).
 *
 * Every verified finding is acted on unless the decisions reject it or
 * hold its unit. The decision file records only the exceptions, because
 * the exceptions are what reading the findings produces:
 *
 *   { "q-34": { "reject": [0], "why": "synonym" },
 *     "q-74": { "note": "Move the vignette to 24 weeks so B is the only answer." },
 *     "q-114": { "hold": "contested: RT alone vs chemoradiotherapy" } }
 *
 * An unsupported claim the support search found stated in a passage is
 * cited, not rewritten. Everything else becomes the fault the repair is
 * told to fix, in the reviewer's words with the correction it proposed,
 * and the passages the search found (supporting a correction, or saying
 * something different from the question) go with it, so the repair can
 * draw on them.
 */
import fs from "node:fs";
import path from "node:path";

type Finding = {
  kind: string;
  where: string;
  quote: string;
  passage_quote?: string;
  chunk_id?: number | string;
  problem: string;
  correction?: string;
  verified: boolean;
};
type Saved = { key: string; ids: number[]; passages: number[]; findings: Finding[] };
type Support = {
  supported: boolean;
  support: { chunk_id: number; verified: boolean }[];
  differs: string;
};
type Decision = {
  reject?: number[];
  hold?: string;
  note?: string;
  extra?: number[];
  /** Findings to cite with these chunks rather than repair, by index. */
  cite?: Record<string, number[]>;
  /** Findings to repair even though a passage was found for them. */
  fix?: number[];
  why?: string;
};

const args = process.argv.slice(2);
const keysAt = args.indexOf("--keys");
const ONLY = keysAt >= 0 ? new Set(args[keysAt + 1].split(",")) : null;

const decisions = JSON.parse(
  fs.readFileSync(".review/fact-decisions.json", "utf8")
) as Record<string, Decision>;

const faults: Record<string, { note: string; extra?: number[] }> = {};
const plan: { id: number; chunk_ids: number[] }[] = [];
const held: string[] = [];
let fixes = 0;
let cites = 0;
let rejects = 0;

for (const f of fs.readdirSync(".review/facts").filter((f) => f.endsWith(".json"))) {
  const saved = JSON.parse(fs.readFileSync(path.join(".review/facts", f), "utf8")) as Saved;
  if (ONLY && !ONLY.has(saved.key)) continue;
  const d = decisions[saved.key] ?? {};
  const live = saved.findings.map((x, i) => ({ ...x, i })).filter((x) => x.verified);
  if (!live.length && !d.note) continue;
  if (d.hold) {
    held.push(`${saved.key} (${saved.ids.join(",")}): ${d.hold}`);
    continue;
  }

  /* Which question a finding belongs to: a set names its scenario. */
  const idOf = (where: string) => {
    const m = /scenario (\d+)/.exec(where);
    const id = m ? Number(m[1]) : NaN;
    return saved.ids.includes(id) ? id : saved.ids[0];
  };
  const perId = new Map<number, { lines: string[]; extra: Set<number> }>();
  const bucket = (id: number) => {
    if (!perId.has(id)) perId.set(id, { lines: [], extra: new Set(d.extra ?? []) });
    return perId.get(id)!;
  };

  for (const x of live) {
    if (d.reject?.includes(x.i)) {
      rejects += 1;
      continue;
    }
    const id = idOf(x.where);
    const supportFile = path.join(".review/support", `${saved.key}-${x.i}.json`);
    const support = fs.existsSync(supportFile)
      ? (JSON.parse(fs.readFileSync(supportFile, "utf8")) as Support)
      : null;
    const manual = d.cite?.[String(x.i)];
    if (manual || (x.kind === "unsupported" && support?.supported && !d.fix?.includes(x.i))) {
      plan.push({ id, chunk_ids: manual ?? support!.support.map((s) => s.chunk_id) });
      cites += 1;
      continue;
    }
    const b = bucket(id);
    b.lines.push(
      `- ${x.where}: "${x.quote}". ${x.problem}${x.passage_quote ? ` The passage says: "${x.passage_quote}".` : ""}${x.correction ? ` Correction: ${x.correction}` : ""}`
    );
    if (support?.supported) for (const s of support.support) if (s.verified) b.extra.add(s.chunk_id);
    for (const m of (support?.differs ?? "").matchAll(/chunks? (\d{3,6})/gi)) b.extra.add(Number(m[1]));
    fixes += 1;
  }
  /* A note written "For scenario 463: ..." belongs to that scenario, not
     to the set's first question: sent to the first, it added an aspirin
     sentence to Q462's caffeine explanation. */
  if (d.note) bucket(idOf(d.note)).lines.push(`- ${d.note}`);

  for (const [id, b] of perId) {
    if (!b.lines.length) continue;
    const prior = faults[String(id)];
    const note =
      `A clinical reviewer audited this question against its sources and found the following. Fix each, changing as little as possible; leave everything else exactly as it is. Where the fix is to remove an unsupported claim, remove it rather than replace it with another claim the passages do not make.\n` +
      b.lines.join("\n");
    faults[String(id)] = {
      note: prior ? `${prior.note}\n${b.lines.join("\n")}` : note,
      extra: Array.from(new Set([...(prior?.extra ?? []), ...b.extra])),
    };
  }
}

fs.writeFileSync(".review/fact-faults.json", JSON.stringify(faults, null, 1));
fs.writeFileSync(".review/citation-plan.json", JSON.stringify(plan, null, 1));
console.log(
  `${Object.keys(faults).length} question(s) to repair (${fixes} finding(s)); ${cites} claim(s) to cite; ${rejects} rejected; ${held.length} unit(s) held`
);
for (const h of held) console.log(`  held ${h}`);
