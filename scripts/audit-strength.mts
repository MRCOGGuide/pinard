/**
 * Explanations that state guidance more strongly than their source does.
 *
 *   npx tsx scripts/audit-strength.mts
 *
 * #1240 said a TAP block "is specifically recommended" where the source
 * said it "should be considered". Both are true sentences about the same
 * paper; only one of them is what the guideline actually committed to.
 * A candidate who learns the stronger version learns something the
 * guidance does not say, and will answer a question about it wrongly.
 *
 * So: flag an explanation that makes a firm claim — recommended, must,
 * always, required, indicated — when nothing in the passages it cites
 * commits that far. A guideline that means it says so somewhere, and
 * "should" counts: it is how guidelines phrase a recommendation.
 *
 * Heuristic and deliberately one-directional. It cannot tell which
 * sentence in a passage a clause came from, so it asks the weaker
 * question — does this source commit anywhere at all? — and leaves the
 * reading to a human.
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

/** A claim the explanation commits to. */
const FIRM =
  /\b(is|are)\s+(strongly\s+|specifically\s+)?(recommended|mandated|required|indicated|essential|mandatory)\b|\bmust\s+(be|not)\b|\balways\s+(be\s+)?(given|offered|performed|used|checked)\b|\bnever\s+(be\s+)?(given|offered|performed|used)\b/gi;

/** How a guideline phrases a commitment of its own. */
const SOURCE_COMMITS =
  /\b(should|must|recommend\w*|mandat\w*|required|indicated|essential|always|never|offer\w*|advise\w*)\b/i;

type Row = {
  id: number;
  status: string;
  explanation: string | null;
  explanations: { key: string; verdict: string; text: string }[];
  citation_chunk_ids: number[] | null;
};

const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from("generated_questions")
    .select("id, status, explanation, explanations, citation_chunk_ids")
    .in("status", ["approved", "pending"])
    .range(from, from + 999);
  const page = (data ?? []) as unknown as Row[];
  rows.push(...page);
  if (page.length < 1000) break;
}

// Every cited passage, once.
const allIds = Array.from(new Set(rows.flatMap((r) => r.citation_chunk_ids ?? [])));
const text = new Map<number, string>();
for (let i = 0; i < allIds.length; i += 200) {
  const { data } = await db
    .from("content_chunks")
    .select("id, text")
    .in("id", allIds.slice(i, i + 200));
  for (const c of (data ?? []) as { id: number; text: string }[]) {
    text.set(c.id, c.text);
  }
}

let flagged = 0;
for (const q of rows) {
  const ids = q.citation_chunk_ids ?? [];
  if (ids.length === 0) continue;
  const source = ids.map((i) => text.get(i) ?? "").join(" ");
  if (!source.trim()) continue;
  if (SOURCE_COMMITS.test(source)) continue; // the source does commit somewhere

  const prose = [q.explanation ?? "", ...(q.explanations ?? []).map((e) => e.text)].join(" ");
  const claims = Array.from(new Set((prose.match(FIRM) ?? []).map((m) => m.toLowerCase())));
  if (claims.length === 0) continue;

  flagged++;
  console.log(`\n#${q.id} (${q.status})  claims: ${claims.join(", ")}`);
  const sentence = prose
    .split(/(?<=\.)\s+/)
    .find((s) => FIRM.test(s));
  if (sentence) console.log(`  "${sentence.replace(/\s+/g, " ").slice(0, 190)}"`);
  console.log(`  cites ${ids.length} passage(s), none of which commit`);
}

console.log(
  `\n${flagged} of ${rows.length} approved or pending questions state guidance` +
    `\nmore firmly than any passage they cite. Read each before changing it:` +
    `\nthe check cannot see which sentence a clause was drawn from.`
);
