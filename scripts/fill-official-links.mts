/**
 * Fill in the official page of RCOG Green-top Guidelines and Scientific
 * Impact Papers (L7.3), which cannot be worked out from the reference.
 *
 *   npx tsx --conditions=react-server scripts/fill-official-links.mts            # report only
 *   npx tsx --conditions=react-server scripts/fill-official-links.mts --apply    # write (needs phase 59)
 *
 * Reads the RCOG's two public list pages, matches each document by its
 * guideline or paper number, and sets official_url only where none is set
 * (one an admin typed is never replaced). DOIs and NICE codes need nothing
 * stored: lib/officialLink works those out. Prints totals only.
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
const { derivedOfficialUrl } = await import("../src/lib/officialLink");

const APPLY = process.argv.includes("--apply");
const BASE = "https://www.rcog.org.uk/guidance/browse-all-guidance";

async function listPage(kind: "green-top-guidelines" | "scientific-impact-papers"): Promise<Map<string, string>> {
  const res = await fetch(`${BASE}/${kind}/`, { headers: { "user-agent": "Mozilla/5.0 (compatible; library link check)" } });
  if (!res.ok) throw new Error(`${kind}: HTTP ${res.status}`);
  const html = await res.text();
  const found = new Map<string, string>();
  for (const m of html.matchAll(new RegExp(`/guidance/browse-all-guidance/${kind}/([a-z0-9+-]+)/`, "g"))) {
    const slug = m[1];
    const n = slug.match(/(?:-no-?|-sip-?|sip|-paper-)(\d+[a-c]?)(?:-|$)/)?.[1];
    if (n && !found.has(n)) found.set(n, `${BASE}/${kind}/${slug}/`);
  }
  return found;
}

const [gtg, sip] = await Promise.all([listPage("green-top-guidelines"), listPage("scientific-impact-papers")]);
console.log(`RCOG pages found: ${gtg.size} Green-top Guidelines, ${sip.size} Scientific Impact Papers`);

const db = createAdminClient();
type Doc = { id: number; title: string | null; source_reference: string | null; official_url?: string | null };
const docs = await fetchAll<Doc>((f, t) => db.from("content_documents").select("id, title, source_reference").order("id").range(f, t));
let current = new Map<number, string | null>();
{
  const { data, error } = await db.from("content_documents").select("id, official_url").limit(5000);
  if (error) {
    if (APPLY) {
      console.error("The official_url column is not there yet: run supabase/phase59-official-links.sql first.");
      process.exit(1);
    }
    console.log("(official_url column not there yet: reporting only)");
  } else current = new Map((data ?? []).map((d) => [d.id as number, d.official_url as string | null]));
}

const GTG = /\b(?:GTG|Green-?top Guideline)\s*(?:No\.?\s*)?(\d{1,3}[a-c]?)\b/i;
const SIP = /\b(?:SIP|Scientific Impact Paper)\s*(?:No\.?\s*)?(\d{1,3})\b/i;

const plan: { id: number; url: string }[] = [];
let derived = 0;
let alreadySet = 0;
let unmatched = 0;
const unmatchedNumbers = new Set<string>();
for (const d of docs) {
  const text = `${d.source_reference ?? ""} ${d.title ?? ""}`;
  if (current.get(d.id)) {
    alreadySet++;
    continue;
  }
  if (derivedOfficialUrl(d.source_reference, d.title)) {
    derived++;
    continue;
  }
  const g = text.match(GTG)?.[1]?.toLowerCase();
  const s = text.match(SIP)?.[1];
  const url = g ? gtg.get(g) : s ? sip.get(s) : undefined;
  if (url) plan.push({ id: d.id, url });
  else if (g || s) {
    unmatched++;
    unmatchedNumbers.add(g ? `GTG ${g}` : `SIP ${s}`);
  }
}

console.log(`documents: ${docs.length}; link set already ${alreadySet}; worked out from a DOI or NICE code ${derived}`);
console.log(`RCOG pages to set: ${plan.length}; RCOG numbers with no page on the list: ${unmatched} (${[...unmatchedNumbers].join(", ") || "none"})`);
console.log(`left without a link: ${docs.length - alreadySet - derived - plan.length}`);

if (!APPLY) {
  console.log("Report only. Run with --apply to set them.");
  process.exit(0);
}
let written = 0;
for (const p of plan) {
  const { error } = await db.from("content_documents").update({ official_url: p.url }).eq("id", p.id).is("official_url", null);
  if (!error) written++;
}
console.log(`set ${written} of ${plan.length}`);
