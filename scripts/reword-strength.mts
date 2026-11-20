/**
 * Approved questions firmer than their guidance, put back to the
 * guidance's own strength (owner, 20 November 2026: "Questions accuracy
 * is the single most important feature").
 *
 *   npx tsx --conditions=react-server scripts/reword-strength.mts [--limit N]
 *       proposes, from scripts/audit-strength.mts's list (.review/strength-approved.json),
 *       into .review/reword-strength/proposals.json; resumes
 *   npx tsx --conditions=react-server scripts/reword-strength.mts --apply
 *       applies the proposals marked "ok", after they have been read
 *
 * Only the sentences holding a strong word the cited passages never use
 * are rewritten, each to the strength the passage itself gives ("should",
 * "consider", "may", "should be avoided", "do not"); every other sentence
 * must come back word for word. A proposal is checked before it is
 * offered: the strong word gone, the other sentences unchanged, the same
 * figures, about the same length. Applied only if the stored text is still
 * the one it was written from. Opus 4.5, then Sonnet 4.5 (never the live
 * app's models for bulk work).
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
const { claudeClient } = await import("../src/lib/anthropic");
const { extractJson } = await import("../src/lib/generation");
const { strengthProblems, STRONG_TERMS } = await import("../src/lib/wordingStrength");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const LIMIT = Number(args[args.indexOf("--limit") + 1] ?? Infinity) || Infinity;
const DIR = ".review/reword-strength";
const FILE = `${DIR}/proposals.json`;
const MODELS = ["global.anthropic.claude-opus-4-5-20251101-v1:0", "global.anthropic.claude-sonnet-4-5-20250929-v1:0"];

type Part = "stem" | "explanation" | "option";
type Proposal = {
  id: number;
  part: Part;
  /** Option key, or the explanation's key. */
  key: string;
  before: string;
  after: string;
  status: "ok" | "failed";
  problems: string[];
};

const db = createAdminClient();
fs.mkdirSync(DIR, { recursive: true });
const proposals: Proposal[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];
const save = () => fs.writeFileSync(FILE, JSON.stringify(proposals, null, 2));

type Q = {
  id: number;
  status: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_key: string;
  explanations: { key: string; text: string; citation_chunk_ids?: number[] }[];
  citation_chunk_ids: number[] | null;
};
async function load(id: number): Promise<Q | null> {
  const { data } = await db.from("generated_questions").select("id, status, stem, options, correct_key, explanations, citation_chunk_ids").eq("id", id).single();
  return (data as unknown as Q) ?? null;
}
async function passagesOf(q: Q): Promise<string[]> {
  const ids = [...new Set([...(q.citation_chunk_ids ?? []), ...q.explanations.flatMap((e) => e.citation_chunk_ids ?? [])])];
  if (!ids.length) return [];
  const { data } = await db.from("content_chunks").select("text").in("id", ids);
  return (data ?? []).map((c) => c.text as string);
}
const sentences = (t: string) => t.split(/(?<=[.;?])\s+/).filter(Boolean);
const strong = (s: string) => STRONG_TERMS.some((t) => t.draft.test(s));
const NUMBERS = (t: string) => (t.match(/\d+(?:\.\d+)?/g) ?? []).sort().join(",");
const wordsIn = (t: string) => t.split(/\s+/).filter(Boolean).length;

function textOf(q: Q, part: Part, key: string): string {
  if (part === "stem") return q.stem;
  if (part === "option") return q.options.find((o) => o.key === key)?.text ?? "";
  return q.explanations.find((e) => e.key === key)?.text ?? "";
}

if (APPLY) {
  let applied = 0;
  let skipped = 0;
  for (const p of proposals.filter((x) => x.status === "ok")) {
    const q = await load(p.id);
    if (!q || q.status !== "approved" || textOf(q, p.part, p.key) !== p.before) {
      skipped++;
      continue;
    }
    const update =
      p.part === "stem"
        ? { stem: p.after }
        : p.part === "option"
          ? { options: q.options.map((o) => (o.key === p.key ? { ...o, text: p.after } : o)) }
          : { explanations: q.explanations.map((e) => (e.key === p.key ? { ...e, text: p.after } : e)) };
    const { error } = await db.from("generated_questions").update(update).eq("id", p.id).eq("status", "approved");
    if (error) skipped++;
    else applied++;
  }
  console.log(`applied ${applied}, skipped ${skipped}`);
  process.exit(0);
}

const PROMPT = `TASK: Put the marked sentences of ONE exam question back to the strength its guidance actually uses. Change nothing else.

You are given the text, the sentences to fix (each holds a word such as "must", "mandatory", "contraindicated", "never", "always", "essential" or "is indicated" that the cited guidance never uses), and the cited passages.

Requirements:
- In each marked sentence, replace the overstated word or phrase with the strength the passages themselves give for that point: "should", "should not", "consider", "may", "should be avoided", "do not", "is recommended", "is not recommended". Read the passages to see which: never make a point firmer or weaker than they do.
- Keep every fact, figure and qualifier, and the rest of the sentence's wording, as it is.
- Every sentence that is not marked must come back exactly as given, character for character.
- Do not write "must", "mandatory", "contraindicated", "prohibited", "absolute", "never", "always", "essential" or "is indicated" unless the passages use that word.
- UK English. No em dashes.

Respond with ONLY this JSON, no fences:
{"text": "the whole text with only the marked sentences changed"}`;

const findings = JSON.parse(fs.readFileSync(".review/strength-approved.json", "utf8")) as { id: number; problem: string }[];
const ids = [...new Set(findings.map((f) => f.id))].filter((id) => !proposals.some((p) => p.id === id && p.status === "ok")).slice(0, LIMIT);
console.log(`${ids.length} questions to propose`);
let modelAt = 0;
for (const id of ids) {
  const q = await load(id);
  if (!q || q.status !== "approved") continue;
  const passages = await passagesOf(q);
  const parts: { part: Part; key: string; text: string }[] = [
    { part: "stem", key: "", text: q.stem },
    ...q.options.filter((o) => o.key === q.correct_key).map((o) => ({ part: "option" as Part, key: o.key, text: o.text })),
    ...q.explanations.filter((e) => e.key === q.correct_key).map((e) => ({ part: "explanation" as Part, key: e.key, text: e.text })),
  ];
  for (const part of parts) {
    const flagged = strengthProblems([{ label: part.part, text: part.text, stem: part.part === "stem" }], passages);
    if (!flagged.length) continue;
    const marked = sentences(part.text).filter((s) => strong(s) && strengthProblems([{ label: part.part, text: s, stem: part.part === "stem" }], passages).length);
    const user = `TEXT:\n${part.text}\n\nSENTENCES TO FIX:\n${marked.map((s) => `- ${s}`).join("\n")}\n\nCITED PASSAGES:\n${passages.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}`;
    let after = "";
    let problems: string[] = ["not attempted"];
    for (let attempt = 0; attempt < 3 && problems.length; attempt++) {
      let raw = "";
      try {
        const res = await claudeClient().messages.create({
          model: MODELS[modelAt],
          max_tokens: 1500,
          system: PROMPT,
          messages: [{ role: "user", content: attempt ? `${user}\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ${problems.join("; ")}` : user }],
        });
        raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/too many tokens|throttl|quota|rate.?limit|429/i.test(message) && modelAt < MODELS.length - 1) {
          modelAt++;
          attempt--;
          continue;
        }
        problems = [`model call failed: ${message.slice(0, 100)}`];
        break;
      }
      try {
        after = String((JSON.parse(extractJson(raw)) as { text?: unknown }).text ?? "").trim();
      } catch {
        problems = ["the response was not JSON"];
        continue;
      }
      const keptBefore = sentences(part.text).filter((s) => !marked.includes(s));
      const lost = keptBefore.filter((s) => !after.includes(s));
      const ratio = wordsIn(after) / Math.max(1, wordsIn(part.text));
      problems = [
        ...strengthProblems([{ label: part.part, text: after, stem: part.part === "stem" }], passages),
        ...(lost.length ? [`a sentence that was not marked changed: "${lost[0].slice(0, 80)}"`] : []),
        ...(NUMBERS(after) !== NUMBERS(part.text) ? ["the figures changed"] : []),
        ...(ratio < 0.85 || ratio > 1.15 ? ["the length changed"] : []),
        ...(/—/.test(after) ? ["an em dash"] : []),
      ];
    }
    const proposal: Proposal = { id, part: part.part, key: part.key, before: part.text, after, status: problems.length ? "failed" : "ok", problems };
    const at = proposals.findIndex((p) => p.id === id && p.part === part.part && p.key === part.key);
    if (at >= 0) proposals[at] = proposal;
    else proposals.push(proposal);
    save();
    console.log(`  #${id} ${part.part}: ${proposal.status}${problems.length ? ` (${problems[0].slice(0, 90)})` : ""}`);
  }
}
const ok = proposals.filter((p) => p.status === "ok").length;
console.log(`\n${ok} proposals ready, ${proposals.length - ok} failed. Read ${FILE} before --apply.`);
