import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * An independent audit of a question against the passages it cites: the
 * same reading the Revise skill gives the Review queue, run on every draft
 * before it is saved (owner, 15 November 2026, after a Revise run repaired
 * 113 of 169 questions: "I don't want similar mistakes in future
 * generation").
 *
 * The generator's other checks are mechanical, and the grounding check
 * asks one thing: is the marked answer stated in the passages. Neither can
 * see a second defensible option, a vignette that contradicts itself, a
 * detail lifted from a guideline condition that does not hold in the
 * scenario, or an explanation firmer than its source. Those were most of
 * what the owner and the Revise run found. This reads the whole question
 * as an examiner would, and a finding it can back with the question's own
 * words goes back to the writer as a fault to fix.
 *
 * Shared with scripts/audit-facts.mts, so the bank and every new draft are
 * held to the same standard.
 */
export const AUDIT_SYSTEM = `You are a senior UK obstetrician and gynaecologist and an MRCOG Part 2 examiner. You are auditing questions for a revision bank that candidates learn from. Every error you miss is taught to a trainee as fact. Every finding you invent wastes a clinician's time. Be exact.

You are given one unit: a single best answer question, or an extended matching set (one option list shared by several scenarios). With it you are given the source passages the question cites, each labelled with its chunk id and document.

Read the stem, every option, the marked answer and every explanation, and report:

wrong_answer: the marked answer is not the correct answer according to the passages, or according to current UK practice if the passages are silent.
second_answer: another option is also correct, or equally defensible as the best answer, so a well-prepared candidate could reasonably choose it.
contradicts_source: something the question or explanation states disagrees with a cited passage. Give the passage's own words.
misquoted: a figure, threshold, dose, interval, drug or term differs from the passage it came from, or a sign, unit or decimal is wrong, or a statement is made firmer or wider than the passage makes it. Give the passage's own words.
unsupported: a factual statement (a figure, a recommendation, a mechanism, a rate, a named fact) that none of the cited passages states. This includes figures the explanation worked out itself (converting a percentage into "1 in N", a hazard ratio into "84% higher") and reasoning presented as fact that the passages do not give. Do NOT report the vignette's own invented clinical details, the restating of a passage in other words, or arithmetic on the vignette's own numbers.
incoherent: the vignette contradicts itself or its marked answer: a step already done, impossible at the stage described, a risk factor counted that she no longer has, details that do not fit together, or a stem that asks a different question from the one the answer answers.
clinical_concern: from your own knowledge, something is wrong, unsafe or out of date for current UK practice (RCOG, NICE, BASHH, FSRH, UKMEC) even though the passages may say it. Say what current guidance says and name the guidance.
flawed_item: the answer can be found without the knowledge being tested (the stem gives it away, only one option is plausible, the right answer is the only one of its kind), or the stem is ambiguous about what is asked.

The faults an examiner has had to correct in this bank, to look for in particular, under the kind named:
- incoherent: parity that does not fit the moment described. Gravida counts the current pregnancy; once she has given birth she is "para N", so "gravida 1 para 0" on the postnatal ward, or "gravida 2 para 1" after her second birth, is wrong. Parity that does not add up with the history given (a previous CS and a later vaginal birth make her gravida 3 para 2 when pregnant again).
- incoherent: a detail lifted from a guideline condition that does not hold in this scenario. "Regardless of RAADP at 28 weeks" means RAADP earlier in this pregnancy, not in a previous one; an abruption in a previous pregnancy does not make this pregnancy's bleed an abruption; "no instrumentation" has no meaning in an ongoing viable pregnancy; "no psychiatric history" in a question that asks only for a risk.
- incoherent: a finding the stem says was made in a way that cannot make it (examination cannot suggest fetal anaemia; speculum examination does not show effacement; pooling of liquor with intact membranes), a suspicion with no reason given for it, a fetal weight impossible for the gestation, a CTG where it is not used, or a woman asking for a step meant for someone in another setting (standby malaria treatment while she is in hospital).
- second_answer: two regimens the passage gives as equal alternatives both in the list; a referral, second opinion or review that the guidance places before the keyed step; a step that is also indicated for her (nephrology referral beside thromboprophylaxis, admission beside the test); a lead-in asking which option "should be avoided" or "is safe" when another option should also be avoided or is also safe; an option within the range another body gives.
- flawed_item: the figure asked for is one study's result recounted inside the guidance (a cohort, a case series, a survey) rather than the figure or recommendation the guidance itself gives for counselling; the question asks for the neonatal team's care of the baby after birth; the stem names its source or guidance body.
- misquoted: "must" where the passage says "should", "should" where it says "consider" or "can", "diagnosed" where it says "likely", a qualifier dropped ("major", "if required", "in the presence of").
- clinical_concern: the answer follows an older edition or older practice where current UK practice has moved (a drug no longer first line, a product not used in the UK).

Work in this order, for every scenario, before you write a finding:
1. Say to yourself what the stem asks, in one line. Does it ask one thing? Is the marked answer an answer to that question, of the kind asked (a figure for "what is the risk", a step for "what should be done")?
2. Walk the vignette in time: parity, gestation, what has already been done, what she has now. Does every detail fit the moment, and is anything the answer depends on (the regimen already started, the review already done, the reason for a suspicion) actually stated?
3. Take every option that is not the marked answer, one at a time, and ask: would the passages, or current UK practice, support it for this woman as described? Is it an equal alternative the passage names, a step the guidance puts first, something also indicated for her, or a figure inside another option's range? If yes, that is a second_answer.
4. Only then read the explanation against the passages, sentence by sentence, for anything unsupported, misquoted or firmer than its source.

Do not report spelling, style, length or formatting. Do not report a passage's own wording as an error. Do not report something you are unsure of: if you would write "arguably", "may", or "could be seen as", leave it out. Most questions have no findings, and an empty list is the expected answer for a sound one.

For every finding:
- "where": "stem", "lead_in", "option B", "explanation", "table", or for a set "scenario <label> stem" / "scenario <label> explanation" / "option B".
- "quote": the exact words from the question that are wrong, copied character for character, at least five words where the text allows.
- "passage_quote" and "chunk_id": for contradicts_source and misquoted, the passage's words copied exactly, and its chunk id.
- "problem": one or two sentences saying what is wrong.
- "correction": what it should say instead, drawn from the passages where they cover it.

Reply with JSON only, in exactly this shape:
{"findings":[{"kind":"misquoted","where":"explanation","quote":"...","passage_quote":"...","chunk_id":1234,"problem":"...","correction":"..."}]}`;

export type AuditFinding = {
  kind: string;
  where?: string;
  quote?: string;
  passage_quote?: string;
  chunk_id?: number;
  problem?: string;
  correction?: string;
  /** The quote is in the question and, where one is needed, the passage quote is in the passages. */
  verified: boolean;
};

type Explanation = { key: string; text: string };
type Option = { key: string; text: string };
export type AuditUnit = {
  format: "sba" | "emq";
  lead_in?: string | null;
  options: Option[];
  scenarios: { label: string; stem: string; correct_key: string; explanations: Explanation[]; explanation?: string | null }[];
  table?: { headers?: string[]; rows?: string[][] } | null;
};
export type AuditPassage = { id: number; text: string; label: string };

/** The unit as the auditor reads it. */
export function renderAuditUnit(u: AuditUnit): string {
  const parts: string[] = [];
  if (u.format === "emq") {
    parts.push(`EXTENDED MATCHING SET (scenarios ${u.scenarios.map((s) => s.label).join(", ")})`);
    if (u.lead_in) parts.push(`LEAD-IN: ${u.lead_in}`);
    parts.push(`OPTIONS:\n${u.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`);
    for (const s of u.scenarios) {
      parts.push(`--- scenario ${s.label} ---\nSTEM: ${s.stem}\nMARKED ANSWER: ${s.correct_key}`);
      for (const e of s.explanations ?? []) parts.push(`EXPLANATION (${e.key}): ${e.text}`);
      if (s.explanation) parts.push(`EXPLANATION: ${s.explanation}`);
    }
  } else {
    const s = u.scenarios[0];
    parts.push(`SINGLE BEST ANSWER (question ${s.label})`);
    parts.push(`STEM: ${s.stem}`);
    if (u.lead_in) parts.push(`LEAD-IN: ${u.lead_in}`);
    parts.push(`OPTIONS:\n${u.options.map((o) => `${o.key}. ${o.text}`).join("\n")}`);
    parts.push(`MARKED ANSWER: ${s.correct_key}`);
    if (s.explanation) parts.push(`EXPLANATION: ${s.explanation}`);
    for (const e of s.explanations ?? []) parts.push(`EXPLANATION (${e.key}): ${e.text}`);
  }
  if (u.table?.rows?.length) parts.push(`TABLE:\n${[u.table.headers ?? [], ...u.table.rows].map((r) => r.join(" | ")).join("\n")}`);
  return parts.join("\n\n");
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/* A quote is found when its words appear in order; a model shortens a
   quote at its ends more often than it alters it in the middle, so the
   longest stretch of it that matches counts, if it is long enough to mean
   something. */
export function quoteFound(quote: string | undefined, text: string): boolean {
  if (!quote) return false;
  const q = norm(quote).replace(/\.\.\.|…/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(text);
  if (q.length < 8) return t.includes(q) && q.length > 0;
  if (t.includes(q)) return true;
  for (const piece of q.split(/ (?:\.\.\.|…) | \[.*?\] /)) if (piece.length >= 25 && t.includes(piece)) return true;
  const minLen = Math.min(40, Math.floor(q.length * 0.6));
  for (let len = q.length - 1; len >= minLen; len -= 4)
    for (let i = 0; i + len <= q.length; i += 4) if (t.includes(q.slice(i, i + len))) return true;
  return false;
}

export function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/** Findings from a reply, each checked against the question and the passages. */
export function readFindings(reply: string, question: string, passages: AuditPassage[]): AuditFinding[] {
  const json = firstJsonObject(reply);
  if (!json) throw new Error(`audit gave no JSON: ${reply.slice(0, 200)}`);
  const parsed = JSON.parse(json) as { findings?: Omit<AuditFinding, "verified">[] };
  const passageText = passages.map((p) => p.text).join("\n");
  return (parsed.findings ?? []).map((raw) => {
    // It names the field "type" as often as "kind".
    const f = { ...raw, kind: raw.kind ?? (raw as { type?: string }).type ?? "unknown" };
    const quoteOk = quoteFound(f.quote, question);
    const passageOk = !["contradicts_source", "misquoted"].includes(f.kind) || quoteFound(f.passage_quote, passageText);
    return { ...f, verified: quoteOk && passageOk };
  });
}

export const AUDIT_THINKING = 3000;

/** One audit call. Throws when the model cannot be reached; the caller decides what that means. */
export async function auditUnit(
  client: Anthropic,
  model: string,
  unit: AuditUnit,
  passages: AuditPassage[],
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<AuditFinding[]> {
  const question = renderAuditUnit(unit);
  const user = `${question}\n\n=== CITED PASSAGES ===\n\n${passages.map((p) => `[chunk ${p.id}] ${p.label}\n${p.text}`).join("\n\n")}`;
  const reply = await client.messages.create(
    {
      model,
      max_tokens: AUDIT_THINKING + 4000,
      thinking: { type: "enabled", budget_tokens: AUDIT_THINKING },
      system: AUDIT_SYSTEM,
      messages: [{ role: "user", content: user }],
    },
    options
  );
  const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return readFindings(text, question, passages);
}

/**
 * A second reading with one question only: is any option other than the
 * marked answer defensible? The full audit finds wording faults well and
 * second answers unreliably: on the Revise run's originals it named the
 * second answer in #2650 but not in #2630, #2640 or #2755, where another
 * option was also a recommended step for the woman described. Asked on its
 * own, the question gets the examiner's whole attention.
 */
export const DISTRACTOR_SYSTEM = `You are an MRCOG Part 2 examiner checking that a question has exactly one best answer. You are given one unit (a single best answer question, or an extended matching set whose scenarios share one option list) and the source passages it cites.

For every scenario, take each option that is NOT its marked answer, one at a time, and decide whether a well-prepared UK candidate could defend it as the best answer for the woman exactly as described. An option is defensible when:
- the passages give it as an equal alternative to the marked answer (two regimens joined by "or", two drugs offered alike);
- the guidance puts it before the marked step for her (a referral, second opinion, senior review or test that comes first), or it is also indicated for her now and the stem does not rule it out;
- it says the same as the marked answer in other words, or its value lies inside the marked answer's range or the marked answer's value inside its range;
- the stem leaves out a fact that would make the marked answer right and this option wrong.

An option that is merely true in a different situation, or a step that follows later, is NOT defensible. Most options are not defensible, and an empty list is the expected answer for a sound question.

Reply with JSON only:
{"defensible":[{"scenario":"<label>","option":"B","why":"one or two sentences","evidence":"exact words from the passages or the stem that make it defensible"}]}`;

export type DefensibleOption = { scenario?: string; option?: string; why?: string; evidence?: string; verified: boolean };

/** One distractor call. Throws when the model cannot be reached. */
export async function auditDistractors(
  client: Anthropic,
  model: string,
  unit: AuditUnit,
  passages: AuditPassage[],
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<DefensibleOption[]> {
  const question = renderAuditUnit(unit);
  const user = `${question}\n\n=== CITED PASSAGES ===\n\n${passages.map((p) => `[chunk ${p.id}] ${p.label}\n${p.text}`).join("\n\n")}`;
  const reply = await client.messages.create(
    {
      model,
      max_tokens: AUDIT_THINKING + 2000,
      thinking: { type: "enabled", budget_tokens: AUDIT_THINKING },
      system: DISTRACTOR_SYSTEM,
      messages: [{ role: "user", content: user }],
    },
    options
  );
  const text = reply.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = firstJsonObject(text);
  if (!json) throw new Error(`distractor check gave no JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(json) as { defensible?: Omit<DefensibleOption, "verified">[] };
  const known = new Set(unit.options.map((o) => o.key));
  const sources = `${question}\n${passages.map((p) => p.text).join("\n")}`;
  return (parsed.defensible ?? []).map((d) => ({
    ...d,
    // Backed by words that are really there, about an option that exists.
    verified: Boolean(d.option && known.has(d.option.trim().replace(/^option\s+/i, "")) && quoteFound(d.evidence, sources)),
  }));
}

export function distractorProblem(d: DefensibleOption): string {
  const where = d.scenario ? `scenario ${d.scenario}, ` : "";
  return `independent audit, second answer (${where}option ${d.option}): ${d.why ?? ""} Change the stem so the vignette rules it out, or replace the option.`.trim();
}

/** A verified finding as a fault the writer is told to fix. */
export function auditProblem(f: AuditFinding): string {
  const where = f.where ? ` (${f.where})` : "";
  const fix = f.correction ? ` Fix: ${f.correction}` : "";
  return `independent audit, ${f.kind.replace(/_/g, " ")}${where}: ${f.problem ?? ""}${fix}`.trim();
}
