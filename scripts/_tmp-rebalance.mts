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
const db = createAdminClient();
const APPLY = process.argv.includes("--apply");

// Only distractors change. The answer is never touched, so nothing the
// grounding check reads has moved — which matters with the API down.
const NEW_DISTRACTORS: Record<number, Record<string,string>> = {
  32:  { C: "Proceed with CVS at 12 weeks as planned, without awaiting the outstanding virology results" },
  410: { B: "No monitoring is required, and she can be discharged from follow-up" },
  411: { B: "CO2 laser vaporisation is preferred over cystectomy at all time points after surgery" },
  550: { C: "Vaginal oestrogen is safe in this setting and requires no additional discussion" },
  607: { D: "Refer immediately to local authority children's social care and take no further action within the organisation" },
  642: { B: "Gonadotrophins should be offered in preference to laparoscopic ovarian surgery in clomiphene-resistant PCOS",
         E: "Laparoscopic ovarian surgery should be offered to all women with clomiphene-resistant PCOS before gonadotrophins" },
};

const w=(s:string)=>s.split(/\s+/).filter(Boolean).length;
let ok=0, bad=0;
for (const [idStr, changes] of Object.entries(NEW_DISTRACTORS)) {
  const id=Number(idStr);
  const { data } = await db.from("generated_questions").select("*").eq("id",id).single();
  const cur = data as any;
  if (Object.keys(changes).includes(cur.correct_key)) { console.log(`#${id}: refuses to touch the answer`); bad++; continue; }
  const options = cur.options.map((o:any)=> changes[o.key] ? { ...o, text: changes[o.key] } : o);
  const q = { ...cur, options } as any;
  const problems = verifyQuestion(q, new Set(cur.citation_chunk_ids ?? []));
  const overlap = overlappingOptionProblems(options);
  const just = optionJustificationProblems(options);
  const answer = options.find((o:any)=>o.key===cur.correct_key)!;
  const others = options.filter((o:any)=>o.key!==cur.correct_key);
  const mean = others.reduce((s:number,o:any)=>s+w(o.text),0)/others.length;
  const before = cur.options.filter((o:any)=>o.key!==cur.correct_key)
    .reduce((s:number,o:any)=>s+w(o.text),0)/others.length;
  console.log(`\n#${id}: answer ${w(answer.text)}w, distractor mean ${before.toFixed(1)}w -> ${mean.toFixed(1)}w  (${(w(answer.text)/before).toFixed(2)}x -> ${(w(answer.text)/mean).toFixed(2)}x)`);
  for (const k of Object.keys(changes)) console.log(`   ${k}. ${changes[k]}`);
  const blockers=[problems.length&&`verify: ${problems[0]}`, overlap.length&&`overlap: ${overlap[0]}`, just.length&&`justified: ${just[0]}`].filter(Boolean);
  if (blockers.length) { console.log(`   BLOCKED — ${blockers.join(" | ")}`); bad++; continue; }
  if (!APPLY) { ok++; continue; }
  const { error } = await db.from("generated_questions").update({ options }).eq("id",id);
  if (error) { console.log(`   FAILED ${error.message}`); bad++; continue; }
  ok++;
}
console.log(`\n${APPLY?"applied":"would apply"} ${ok}, blocked ${bad}`);
