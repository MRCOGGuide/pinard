/**
 * L7.1 and L7.2: style examples from the approved bank, and the check on
 * wording copied from the cited guidance.
 *
 *   npx tsx --conditions=react-server scripts/test-sources-l7.mts
 *
 * Read-only against the database (it reads approved questions); prints
 * pass or fail and question ids only.
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
const { bankStyleExamples } = await import("../src/lib/generate-batch");
const { copiedWordingProblems, longestCopiedRun, overlapIndex } = await import("../src/lib/sourceOverlap");
const { PROMPT_L, PROMPT_Q, PROMPT_Q_EMQ } = await import("../src/lib/prompts");

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// --- L7.2: the measure itself ---------------------------------------------
const passage = {
  chunk_id: 1,
  text: "Women with a BMI of 30 kg/m2 or more should be advised to take 5 mg of folic acid daily, starting at least 1 month before conception and continuing throughout the first trimester.",
};
const index = overlapIndex([passage]);
check(
  "a copied sentence is caught",
  (longestCopiedRun("Women with a BMI of 30 kg/m2 or more should be advised to take 5 mg of folic acid daily.", index)?.words ?? 0) >= 10
);
check(
  "the same fact in other words is not",
  longestCopiedRun("Obese women planning a pregnancy need the higher 5 mg dose of folic acid from a month before conceiving until 12 weeks.", index) === null
);
check(
  "figures are matched but not counted",
  longestCopiedRun("rates of 12.6–21.0% in women of 40 and over", overlapIndex([{ chunk_id: 2, text: "rates of 12.6–21.0% in women of 40 and over were reported" }])) === null
);
const problems = copiedWordingProblems(
  [
    { label: "stem", text: "A woman with a BMI of 34 plans a pregnancy." },
    { label: "explanation for A", text: "She should be advised to take 5 mg of folic acid daily, starting at least 1 month before conception and continuing throughout the first trimester." },
  ],
  [passage]
);
check("the generator is told which part copies, and from which passage", problems.length === 1 && problems[0].includes("explanation for A") && problems[0].includes("[chunk:1]"), problems[0] ?? "none");
check("the writing rule is in the prompt both writers read", PROMPT_L.includes("WRITE IT IN YOUR OWN WORDS") && PROMPT_Q.includes(PROMPT_L.slice(0, 40)) && PROMPT_Q_EMQ.includes(PROMPT_L.slice(0, 40)));
check("the prompt no longer quotes the old book's explanation", !PROMPT_L.includes("Aminosalicylates"));

// --- L7.3: Ask Pinard in its own words, with short quotations -----------------
const { answerWordingProblems } = await import("../src/lib/sourceOverlap");
const nice = [{ chunk_id: 7, text: "Offer women with a history of gestational diabetes who have a negative postnatal test for diabetes an annual HbA1c test to check that they do not have type 2 diabetes." }];
check(
  "Ask Pinard: a short quotation in quotation marks is allowed",
  answerWordingProblems('- Annual review: "an annual HbA1c test to check that they do not have type 2 diabetes" [chunk:7].', nice).length === 0
);
check(
  "Ask Pinard: the same words outside quotation marks go back",
  answerWordingProblems("- Women with a history of gestational diabetes who have a negative postnatal test for diabetes need an annual HbA1c.", nice).length === 1
);
check(
  "Ask Pinard: a quotation over 25 words goes back",
  answerWordingProblems(`- "${nice[0].text}"`, nice).some((p) => p.includes("quotation runs to"))
);
check(
  "Ask Pinard: its own words pass",
  answerWordingProblems("- After gestational diabetes with a normal postnatal test, check HbA1c every year for type 2 diabetes.", nice).length === 0
);
const promptsSource = fs.readFileSync("src/lib/prompts.ts", "utf8");
check("both Ask Pinard prompts carry the quoting rule", (promptsSource.match(/at most 25 words, with its citation straight after/g) ?? []).length === 2);

// --- L7.3: links to the official page --------------------------------------
const { derivedOfficialUrl, officialUrl, safeLink } = await import("../src/lib/officialLink");
check("a TOG DOI links to doi.org", derivedOfficialUrl("https://doi.org/10.1111/tog.12588") === "https://doi.org/10.1111/tog.12588");
check("a DOI in a reference links to doi.org", derivedOfficialUrl("DOI: 10.1111/tog.12271.") === "https://doi.org/10.1111/tog.12271");
check("a NICE code links to nice.org.uk", derivedOfficialUrl("NICE guideline NG133") === "https://www.nice.org.uk/guidance/ng133");
check("a NICE reference with a space", derivedOfficialUrl("NICE NG 23 (April 2026 update)") === "https://www.nice.org.uk/guidance/ng23");
check("no guessed link for an RCOG number alone", derivedOfficialUrl("RCOG GTG No. 37a") === null);
check("a link set in Admin wins", officialUrl({ official_url: "https://www.rcog.org.uk/x", source_reference: "NICE NG3" }) === "https://www.rcog.org.uk/x");
check("only https is ever a link", safeLink("javascript:alert(1)") === null && safeLink("http://example.com") === null && safeLink("https://a.b/c d") === null);

// --- L7.1: style examples from the approved bank -----------------------------
const db = createAdminClient();
const { data: someSection } = await db.from("generated_questions").select("section_id").eq("status", "approved").eq("format", "sba").limit(1);
const sectionIds = [someSection?.[0]?.section_id as number];

const sba = await bankStyleExamples(db, "sba", sectionIds, 4, 3);
const sbaIds = sba.examples.map((e) => e.id);
const { data: sbaRows } = await db.from("generated_questions").select("id, status, section_id").in("id", sbaIds);
check("four SBA examples", sba.examples.length === 4, `got ${sba.examples.length}`);
check("every SBA example is approved", (sbaRows ?? []).length === sbaIds.length && (sbaRows ?? []).every((r) => r.status === "approved"));
check("none is from the section being written for", (sbaRows ?? []).every((r) => !sectionIds.includes(r.section_id as number)));
check("each from a different section", new Set((sbaRows ?? []).map((r) => r.section_id)).size === sbaIds.length);
check("each carries its explanation", sba.examples.every((e) => (e.rationale ?? "").split(/\s+/).length >= 10));

const emq = await bankStyleExamples(db, "emq", sectionIds, 4, 3);
const scenarioIds = emq.exampleSets.flatMap((s) => s.scenarios.map((sc) => sc.id));
const { data: emqRows } = await db.from("generated_questions").select("id, status, section_id, emq_group_id").in("id", scenarioIds);
check("three EMQ sets", emq.exampleSets.length === 3, `got ${emq.exampleSets.length}`);
check("every set is whole: two or more scenarios, one shared list", emq.exampleSets.every((s) => s.scenarios.length >= 2 && s.options.length >= 5));
check("every scenario is approved and outside the section", (emqRows ?? []).every((r) => r.status === "approved" && !sectionIds.includes(r.section_id as number)));
check("each set from a different group", new Set((emqRows ?? []).map((r) => r.emq_group_id)).size === emq.exampleSets.length);

const again = await bankStyleExamples(db, "sba", sectionIds, 4, 3);
check("batches see different examples", again.examples.map((e) => e.id).join() !== sbaIds.join());

// The book is no longer read for the prompt: only for the echo check.
const source = fs.readFileSync("src/lib/generate-batch.ts", "utf8");
const bookReads = source.match(/from\("example_questions"\)/g)?.length ?? 0;
check("the old book is read once, for the echo check only", bookReads === 1 && /never sent\s+to the model/.test(source), `${bookReads} reads`);
check("no TOG CPD text is given to the writer", !/cpdGuideText|highYieldGuide/.test(source) && !/highYieldGuide|HIGH-YIELD TOPIC GUIDE/.test(fs.readFileSync("src/lib/generation.ts", "utf8")));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
