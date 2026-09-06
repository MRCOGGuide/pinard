import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split(/\r?\n/)
    .filter(l=>l.includes("=") && !l.startsWith("#"))
    .map(l=>{const i=l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim()];})
);
for (const [k,v] of Object.entries(env)) process.env[k] ??= v as string;
const { runGenerationBatch } = await import("../src/lib/generate-batch");
let made=0; const times:number[]=[];
for (let i=0;i<4;i++){
  const t0=Date.now();
  const r:any = await runGenerationBatch({ sectionId:4, format:"emq" as any, count:1,
    deadline: Date.now()+20_000, difficultyOffset:i+7 });
  const s=(Date.now()-t0)/1000; times.push(s); made += r.emqScenarios??0;
  console.log(`run ${i+1}: ${s.toFixed(1)}s scenarios=${r.emqScenarios??0}`);
}
console.log(`total scenarios ${made} in 4 runs; worst ${Math.max(...times).toFixed(1)}s (ceiling 60s)`);
