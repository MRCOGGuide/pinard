/**
 * Gives every decision aid's picture a web-sized copy for Admin (owner,
 * 2 November 2026: the page was slow; pictures were up to 6 MB). The
 * copy is a JPEG at most 1600 px wide, stored beside the original as
 * <name>.web.jpg; the original is kept and linked.
 *
 *   npx tsx --conditions=react-server scripts/aid-web-images.mts          # every aid without a copy
 *   npx tsx --conditions=react-server scripts/aid-web-images.mts --force  # all of them again
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
for (const [k, v] of Object.entries(env)) process.env[k] ??= v as string;
const { createAdminClient } = await import("../src/lib/supabase/admin");
const { webImagePath } = await import("../src/lib/decision-aid-shape");
const db = createAdminClient();
const force = process.argv.includes("--force");
const WORK = "scripts/_aid_web";
fs.mkdirSync(WORK, { recursive: true });

const rows: { id: number; image_paths: string[] }[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("decision_aids").select("id,image_paths").range(f, f + 999);
  if (error) throw new Error(error.message);
  rows.push(...((data ?? []) as any));
  if (!data || data.length < 1000) break;
}
const originals = [...new Set(rows.flatMap((r) => r.image_paths ?? []))];

// Which already have a copy (listing each folder once).
const have = new Set<string>();
if (!force) {
  for (const folder of [...new Set(originals.map((p) => path.posix.dirname(p)))]) {
    const { data } = await db.storage.from("sources").list(folder, { limit: 1000 });
    for (const o of data ?? []) have.add(`${folder}/${o.name}`);
  }
}
const todo = originals.filter((p) => force || !have.has(webImagePath(p)));
console.log(`${originals.length} pictures, ${todo.length} without a web copy`);

const local = (p: string) => path.join(WORK, p.replace(/\//g, "_"));
const spec: { in: string; out: string }[] = [];
for (const p of todo) {
  // The crop made by the build is used where it is still on this computer.
  const [, doc, name] = p.split("/");
  const built = path.join("scripts/_aid_pages", doc, name);
  let src = built;
  if (!fs.existsSync(built)) {
    const { data: blob, error } = await db.storage.from("sources").download(p);
    if (error || !blob) { console.log(`${p}: download failed`); continue; }
    src = local(p);
    fs.writeFileSync(src, new Uint8Array(await blob.arrayBuffer()));
  }
  spec.push({ in: src, out: local(webImagePath(p)) });
}
for (let i = 0; i < spec.length; i += 40) {
  const batch = spec.slice(i, i + 40);
  const specFile = path.join(WORK, "_spec.json");
  fs.writeFileSync(specFile, JSON.stringify(batch));
  const out = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/web-images.ps1", "-Spec", specFile, "-MaxSide", "1600"], { encoding: "utf8", timeout: 600000 });
  for (const line of out.split(/\r?\n/)) if (line.startsWith("FAILED")) console.log(line);
}
let uploaded = 0, bytes = 0;
for (const p of todo) {
  const file = local(webImagePath(p));
  if (!fs.existsSync(file)) continue;
  const buf = fs.readFileSync(file);
  const { error } = await db.storage.from("sources").upload(webImagePath(p), buf, { contentType: "image/jpeg", upsert: true });
  if (error) { console.log(`${p}: upload failed: ${error.message}`); continue; }
  uploaded++; bytes += buf.length;
}
console.log(`${uploaded} web copies uploaded, average ${uploaded ? Math.round(bytes / uploaded / 1024) : 0} KB`);
