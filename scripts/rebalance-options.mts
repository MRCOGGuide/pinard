/**
 * Even out the weight of an option list.
 *
 * The longest option being the answer is the oldest tell in multiple
 * choice, and it appears whenever the right option is given its
 * supporting detail and the wrong ones are not. Some of it here was
 * self-inflicted: trimming justifications off distractors left them as
 * stubs beside a full-length answer.
 *
 * Two moves, and the first is much safer than the second. Lengthening
 * a distractor never touches the text the grounding check reads.
 * Trimming the answer does, so it is only for a trailing clause that
 * is plainly supporting detail, and every such question is reported so
 * it can be re-checked.
 *
 *   npx tsx scripts/rebalance-options.mts --dry
 *   npx tsx scripts/rebalance-options.mts
 */
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split(/\r?\n/)
    .filter(l=>l.includes("=") && !l.startsWith("#"))
    .map(l=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];})
);
for (const [k,v] of Object.entries(env)) process.env[k] ??= v as string;
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { verifyQuestion, overlappingOptionProblems, optionJustificationProblems } =
  await import("../src/lib/generation");

type Change = { distractors?: Record<string,string>; answer?: string };
export const CHANGES: Record<number, Change> = {
  63: { distractors: {
    A: "Co-amoxiclav is the preferred prophylactic antibiotic when it is given before skin incision for caesarean birth",
    C: "Prophylactic antibiotics are only required when a caesarean birth is performed under general rather than regional anaesthesia",
    E: "Prophylactic antibiotics should be given after skin incision rather than before, to avoid any effect on the baby",
  }},
  959: { distractors: {
    A: "Micro-TESE should be performed immediately, without waiting for spontaneous recovery of spermatogenesis",
    C: "Serum FSH will rise within four weeks of cessation, confirming that spermatogenesis has recovered",
    D: "Surgical sperm retrieval is contraindicated in men with azoospermia induced by exogenous testosterone",
    E: "Testosterone replacement should be continued at a lower dose to support recovery of spermatogenesis",
  }},
  1093: { distractors: {
    A: "Complications are common and typically require surgical reintervention within the first year",
    C: "Long-term follow-up data confirm sustained improvement in sexual function beyond two years",
    D: "Radiofrequency devices are less well-studied than CO2 or Erbium:YAG laser for vaginal tightening",
    E: "The FDA has endorsed radiofrequency devices as safe and effective for vaginal rejuvenation",
  }},
  1190: { distractors: {
    A: "An opioid analgesic can be given at any time alongside buprenorphine without any risk of withdrawal",
    B: "Buprenorphine should be withheld throughout labour and replaced with regular morphine for analgesia",
    D: "Epidural analgesia is contraindicated in women maintained on buprenorphine during labour and delivery",
    E: "Pethidine is the preferred opioid analgesic for women maintained on buprenorphine during labour",
  }},
};

const db = createAdminClient();
const APPLY = !process.argv.includes("--dry");
const w=(s:string)=>s.split(/\s+/).filter(Boolean).length;
let ok=0, bad=0; const answerChanged:number[]=[];

for (const [idStr, change] of Object.entries(CHANGES)) {
  const id=Number(idStr);
  const { data } = await db.from("generated_questions").select("*").eq("id",id).single();
  if (!data) { console.log(`#${id}: not found`); bad++; continue; }
  const cur = data as any;
  if (change.distractors && Object.keys(change.distractors).includes(cur.correct_key)) {
    console.log(`#${id}: a distractor rewrite names the answer key`); bad++; continue;
  }
  const options = cur.options.map((o:any)=>{
    if (change.distractors?.[o.key]) return { ...o, text: change.distractors[o.key] };
    if (change.answer && o.key === cur.correct_key) return { ...o, text: change.answer };
    return o;
  });
  const q = { ...cur, options } as any;
  const problems = verifyQuestion(q, new Set(cur.citation_chunk_ids ?? []));
  const overlap = overlappingOptionProblems(options);
  const just = optionJustificationProblems(options);
  const ans = options.find((o:any)=>o.key===cur.correct_key)!;
  const others = options.filter((o:any)=>o.key!==cur.correct_key);
  const mean = others.reduce((s:number,o:any)=>s+w(o.text),0)/others.length;
  const oldOthers = cur.options.filter((o:any)=>o.key!==cur.correct_key);
  const oldMean = oldOthers.reduce((s:number,o:any)=>s+w(o.text),0)/oldOthers.length;
  const oldAns = w(cur.options.find((o:any)=>o.key===cur.correct_key)!.text);
  console.log(`#${id}: ${oldAns}w/${oldMean.toFixed(1)}w (${(oldAns/oldMean).toFixed(2)}x) -> ${w(ans.text)}w/${mean.toFixed(1)}w (${(w(ans.text)/mean).toFixed(2)}x)${change.answer?"  [answer changed]":""}`);
  const blockers=[problems.length&&`verify: ${problems[0]}`, overlap.length&&`overlap: ${overlap[0]}`, just.length&&`justified: ${just[0]}`].filter(Boolean);
  if (blockers.length) { console.log(`   BLOCKED — ${blockers.join(" | ")}`); bad++; continue; }
  if (change.answer) answerChanged.push(id);
  if (!APPLY) { ok++; continue; }
  const { error } = await db.from("generated_questions").update({ options }).eq("id",id);
  if (error) { console.log(`   FAILED ${error.message}`); bad++; continue; }
  ok++;
}
console.log(`\n${APPLY?"applied":"would apply"} ${ok}, blocked ${bad}`);
if (answerChanged.length) console.log(`answer text changed, re-check grounding: ${answerChanged.join(" ")}`);
