/**
 * Which stored facts are worth showing a candidate.
 *
 * key_facts holds everything the extractor could find with a number
 * attached, which is the right thing for a store but the wrong thing to
 * put under an answer. A guideline's examinable content — "the risk of
 * uterine rupture is X" — sits in the same table as the AUROC of an AI
 * model, a questionnaire's response rate, and the Dice score of an
 * image-registration method. The first is worth memorising because it
 * could be a question in its own right; the rest are how a paper was
 * conducted, not what a trainee is examined on.
 *
 * The test applied here is the one the owner set: could this fact be
 * asked as a separate question? Three things have to hold — it is a kind
 * of fact the exam asks about, its value is a clean figure, and the
 * statement is about clinical practice rather than about a study.
 *
 * Pure predicates, so they can be unit-tested and reused.
 */

/**
 * Fact types the exam actually asks about. Deliberately narrow: test
 * performance (sensitivity, specificity, accuracy, AUC) is excluded
 * because in this corpus it is overwhelmingly model-evaluation prose
 * from review articles rather than the operating characteristics of a
 * clinical test.
 */
export const EXAMINABLE_FACT_TYPES = new Set([
  "risk",
  "incidence",
  "threshold",
  "thresholds",
  "cut-off",
  "cutoff",
]);

/**
 * A figure a candidate can carry: "7%", "up to 80%", "1 in 200".
 *
 * Anchored deliberately. A loose search for a percent sign matches the
 * "95%" inside "4.52 (95% CI 2.77–7.39)", which then groups a risk ratio
 * with everything else that happens to be 95% — the value the panel
 * pairs on has to BE the figure, not merely contain one.
 */
const CLEAN_FIGURE =
  /^(?:approximately|approx\.?|about|around|up to|at least|over|under|less than|more than|nearly|~|<|>|≤|≥)?\s*\d+(?:\.\d+)?\s*(?:%|per cent)$|^1\s*(?:in|:)\s*\d[\d,]*$/i;

export function isCleanFigure(value: string | null): boolean {
  return Boolean(value && CLEAN_FIGURE.test(value.trim()));
}

/**
 * Prose that describes how a study was run or how a model scored,
 * rather than what is true of patients. Matched against the statement.
 */
const STUDY_NOISE = new RegExp(
  [
    // statistical apparatus
    "95%\s*ci",
    "confidence interval",
    "\bci\b",
    "\bauc\b",
    "auroc",
    "odds ratio",
    "hazard ratio",
    "risk ratio",
    "\bor\s*=",
    "\brr\s*=",
    "pooled",
    "meta-analys",
    "systematic review",
    "p\s*[<=]\s*0\.",
    "dice score",
    // model and test-performance evaluation
    "deep learning",
    "machine learning",
    "neural network",
    "\bAI\b",
    "\bDL[- ]",
    "algorithm",
    "\bmodel\b",
    "radiomics",
    "xgboost",
    "random forest",
    "\bDNN\b",
    "\bRNN\b",
    "\bSVM\b",
    "sensitivity",
    "specificity",
    // "this study observed", rather than "this is the case"
    "response rate",
    "respondents",
    "questionnaire",
    "\bsurvey\b",
    "sample size",
    "missing data",
    "\bdataset\b",
    "control group",
    "study group",
    "intervention group",
    "\bthe patients\b",
    "case series",
    "single-cent(?:re|er)",
    "\bcohort\b",
    "\bparticipants\b",
    "\bregistry\b",
    "\baudit\b",
    "\btrial\b",
    "stud(?:y|ies) (?:found|demonstrated|reported|showed|of)",
    "study to date",
    "\bUKOSS\b",
    "external review",
  ].join("|"),
  "i"
);

export function isStudyNoise(text: string | null): boolean {
  return Boolean(text && STUDY_NOISE.test(text));
}

export type FactShape = {
  fact_type: string | null;
  value_text: string | null;
  statement: string | null;
};

/** Could this fact be asked as a question in its own right? */
export function isExaminableFact(fact: FactShape): boolean {
  if (!EXAMINABLE_FACT_TYPES.has((fact.fact_type ?? "").toLowerCase())) {
    return false;
  }
  if (!isCleanFigure(fact.value_text)) return false;
  if (isStudyNoise(fact.statement)) return false;
  if (isStudyNoise(fact.value_text)) return false;
  return true;
}
