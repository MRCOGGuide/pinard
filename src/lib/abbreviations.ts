/**
 * Which abbreviations a Part 2 candidate reads without being told.
 *
 * The reader is a general obstetrician and gynaecologist, several years
 * into the specialty. They write LSCS and BMI a dozen times a day and
 * expanding those addresses a medical student — so the everyday set is
 * used bare, and the prompt says so.
 *
 * Everything else is a different problem. A stem that reads "tumour HRD
 * testing is negative (HRP)... considered for PARP inhibitor
 * maintenance... the expected PFS benefit" is legible to a
 * gynae-oncologist and to nobody else on the paper. It tests
 * vocabulary, not medicine. Those are written out on first use with the
 * short form after them, and the short form alone thereafter.
 *
 * This is a lint over that rule, not a dictionary of medicine: it can
 * only ask whether a short form was ever introduced, which is the part
 * a machine can judge.
 */

/**
 * Read without expansion. Mirrors the list in prompt L — if one
 * changes, change the other, because a lint that forbids what the
 * prompt asks for is worse than no lint.
 */
export const EVERYDAY_ABBREVIATIONS = new Set([
  // Prompt L's list.
  "BMI", "CTG", "VBAC", "CS", "LSCS", "PPH", "TVS", "hCG", "VTE", "LMWH",
  "OASI", "PAS", "HRT", "TSH", "fT4", "SUI", "PCOS", "IUGR", "FGR",
  // Bodies, publications and places, which are names rather than jargon.
  "RCOG", "NICE", "BGCS", "ESHRE", "BSGE", "FIGO", "WHO", "NHS", "UK", "GTG",
  "TOG", "SIP", "MRCOG", "BJOG", "SIGN", "FSRH", "MBRRACE", "BASHH",
  // Routes, units and everyday clinical shorthand.
  "IV", "IM", "PO", "PR", "PV", "SC", "BP", "HR", "RR", "MDT", "ITU", "HDU",
  "USS", "MRI", "CT", "ECG", "FBC", "LFT", "CRP", "eGFR", "INR", "APTT",
  // Conditions and events a general trainee meets constantly.
  "DIC", "ICP", "GBS", "HIV", "CMV", "DVT", "PE", "PET", "GDM", "OGTT",
  "IUFD", "RFM", "PROM", "PPROM", "SROM", "ARM", "IUD", "IUS", "TOP", "ERPC",
  "MVA", "HMB", "IMB", "PCB", "LLETZ", "CIN", "VIN", "VAIN", "OHSS", "IVF",
  "ICSI", "HSG", "EDD", "LMP", "SFH",
  // Everyday obstetrics and gynaecology a general trainee writes daily.
  "BSO", "TAH", "SGA", "LGA", "EFW", "AFI", "PCR", "DNA", "RNA", "STI",
  "AFP", "LDH", "CA125", "PAPP", "GP", "IU", "BD", "TDS", "QDS", "OD",
  "BHIVA", "RCT", "RCTs", "CI", "BRCA",
  // Chemistry that appears inside an expansion rather than instead of one.
  "ADP", "ATP", "mRNA", "PARP",
  // Contraception and reproductive medicine, which a general trainee
  // writes daily. Their absence is why this lint flagged 562 of 1200
  // questions and was never wired into verification: at that rate it
  // reports the bank rather than the exceptions, and PID, NSAIDs and
  // GnRH are not what "write it out in full" was written to catch.
  "LNG", "COC", "POP", "CHC", "DMPA", "UKMEC", "GnRH", "IUI", "ART",
  "PGT", "AMH", "FSH", "LH", "SHBG", "DHEAS", "HFEA", "SERM", "SERMs",
  // Obstetrics and fetal medicine.
  "CVS", "cffDNA", "NIPT", "MCA", "PSV", "MoM", "RhD", "NICU", "SCBU",
  "FBS", "APH", "MROP", "ERCS", "CPR", "UA", "AC",
  // Gynaecology, oncology and imaging.
  "RMI", "IOTA", "ADNEX", "ROMA", "HPV", "TAC", "TVC", "BPS", "SLNB",
  // Infection, immunology and pharmacology.
  "PID", "PEP", "NSAID", "NSAIDs", "IgG", "IgM", "IgA", "VZV", "HSV",
  "HBV", "HCV", "GUM", "MSU", "TB", "MRSA", "GAS", "iGAS", "UTI",
  // Ordinary investigations and observations.
  "U&E", "UE", "WCC", "Hb", "HbA1c", "TFT", "LDL", "HDL", "BMD", "DEXA",
  "ED", "AE", "SBAR", "WHO SSC", "NOTSS", "OSATS", "CPD", "SSRI", "SSRIs",
  "TTTS", "MCDA", "DCDA", "MCMA", "DVP", "PMS", "IVIG", "GTN", "DDAVP",
  "VWF", "TRAb", "IUT", "PI", "RI", "EDTA", "mIU", "IU/L",
  "FGM", "HLA", "TENS", "UAE", "ECMO", "COCP", "VZIG", "VWD", "UKOSS",
  "POI", "EC", "ATSM", "DCC", "EMA", "HAART", "UFH", "GTD", "IBS", "PTB",
  "EPAU", "CiP", "COC", "IUD",
  "PTSD", "CBT", "AED", "IVH", "RDS", "dVIN", "LS", "FDA", "CiP", "UKHSA",
  "LVSI", "LARC", "OCP", "MHT", "ALT", "AST", "CQC", "MHRA", "SVD", "NNT",
  "SCC", "ARCP", "ACOG", "MMR", "IOL", "ARDS", "DKA", "RPL", "PMDD",
  "LVEF", "PPCM", "CCT", "PrEP", "AFE", "APS", "PND", "ACS", "BCG", "AI",
  "RHD", "CP", "US", "SpO", "FiO", "PaO", "QT", "aPTT",
  "TESE", "ER", "PR", "LP", "IO", "CO", "CL", "MD", "ID", "TG",
  "OV", "MHz", "CMA", "IMP", "SITM", "BSUG", "BritSPAG", "CoSRH", "ESGE",
  "ASRM", "ICS", "BMS", "BSH", "HQIP", "NMPA", "SCH", "IUI",
  // The exam's own vocabulary. A question cannot be asked to explain
  // what an SBA is.
  "SBA", "SBAs", "EMQ", "EMQs", "OSCE", "CEX", "ARCP",
  // Ordinary medicine outside the specialty that any doctor reads.
  "ECV", "CXR", "ICU", "EEG", "COPD", "HELLP", "ASA", "FFP", "KCl",
  "ICH", "HIE", "NNU", "STEMI", "CABG", "PCI", "ACE", "ECOG", "IHC",
  "SNP", "CNV", "CGH", "NAAT", "ESBL", "TORCH", "CPE", "MRSA",
  // Specialty routine.
  "NT", "PMB", "OAB", "LUTS", "PPV", "AFC", "fFN", "ET", "TLH", "TVUS",
  "TVUSS", "IUC", "LAM", "SCD", "ERAS", "MRA", "TVOR", "SDVP", "ECH",
  // Bodies and programmes.
  "GMC", "NHSE", "RCM", "RCR", "DHSC", "GIRFT", "HSIB", "ISSVD", "POGP",
  "NRCPD", "BAAPS", "BAGP", "BSGE", "EPPI", "RAND", "AAP", "INOSS",
  // Ways of working.
  "LTFT", "OOP", "SDG", "SDGs", "POC", "RAADP", "MDT",
  // Karyotypes and genetics notation, which is read rather than
  // expanded: nobody writes out "47,XXY".
  "XY", "XXY", "XYY", "PD", "RT", "SR", "ST", "ES", "CA", "LV", "MS",
  "USA", "AGE", "DSM", "TTN", "CSE", "NRT", "UPA", "ENG", "DRSP",
  "hrHPV", "VEGF", "LQTS", "SSC", "IH", "TAS", "NLA",
]);

/**
 * Words a paper capitalises for emphasis, not abbreviations.
 *
 * "select the SINGLE most appropriate" is the exam's own phrasing and
 * appears in every EMQ lead-in; a lint that asks for it to be written
 * out has misunderstood the sentence.
 */
const EMPHASIS = new Set([
  "SINGLE", "ONE", "ALL", "NOT", "MUST", "NEVER", "ONLY", "EXACTLY",
  "BEST", "MOST", "LEAST", "TRUE", "FALSE", "AND", "OR", "EACH", "BOTH",
  "AVOIDED", "MORE", "LESS", "SHOULD", "EVERY", "ANY", "NONE", "FIRST",
]);

/**
 * Names that happen to be made of capitals, and stage labels.
 *
 * "SARS-CoV-2" is a virus, not an abbreviation awaiting expansion, and
 * splitting it yields SARS and CoV, neither of which means anything on
 * its own. FIGO stages are lettered — IA, IB, IIIC, IVB — and a stage
 * is a stage, not jargon.
 */
const NAMES = new Set([
  "SARS", "CoV", "COVID", "SARS-CoV-2", "BRCA1", "BRCA2",
  // Eponyms. A McDonald cerclage is a McDonald cerclage.
  "McDonald", "McRoberts", "MacDonald", "Shirodkar", "Bakri", "Rubin",
  "Wood", "Zavanelli", "Bandl", "Naegele", "Bishop", "Apgar", "Gillick",
  "Fraser", "Bartholin", "Skene", "Nabothian", "Krukenberg", "Meigs",
  "Asherman", "Mullerian", "Wolffian", "Turner", "Kallmann", "Sheehan",
  "Rokitansky", "Swyer", "Brenner", "Sertoli", "Leydig", "Graafian",
  "McCall", "DiGeorge", "Brugada", "BrugadaDrugs", "Nagele",
  // Trials, registries and scoring systems. A trial acronym has no
  // expansion worth giving a candidate — SOLOMON is what the trial is
  // called — so the house rule is to say it IS a trial, which the
  // prompts ask for and a lint cannot check.
  "SOLOMON", "MAVRIC", "EMMY", "PAOLA", "RECOVERY", "TOPSY", "QUiPP",
  "ROPAC", "POSEIDON", "ENZIAN", "GLENDA", "BEAM", "GROW", "APTIMA",
  "SOSURE", "CUME", "EXCLUSION", "PROT", "RAGS", "MCND", "OBS",
  "PAGE", "HEPEPE", "EPPI", "GOG", "PAOLA-1",
  // Gene and blood-group symbols. KEL*01 is the allele's name.
  "KEL", "RHCE",
  // Part of a device's name rather than jargon: an Nd:YAG laser.
  "YAG", "CCTV",
]);
const STAGE = /^(?:[IVX]{1,4}[A-C]?\d?|T\d[a-c]?|N\d|M\d|G\d)$/;

/**
 * A short form: two or more characters carrying at least two capitals,
 * so PARP and BRCAwt are caught while Word and hCG are not. hCG-shaped
 * names — a lower-case prefix on capitals — are in the everyday set by
 * name rather than by pattern.
 */
const SHORT_FORM = /\b[A-Za-z]*[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b/g;

/** Roman numerals and stage labels are not abbreviations to expand. */
const NOT_AN_ABBREVIATION = /^(?:[IVX]+[a-z]?\d*|[A-Z]\d+|[A-Z])$/;

/**
 * Short forms used in this text that are never written out in it.
 *
 * "Written out" is taken to be the short form appearing in brackets
 * somewhere — "progression-free survival (PFS)" — which is how the
 * prompt asks for it and is the only introduction a lint can recognise
 * without a dictionary of every expansion.
 */
/** Whether a phrase's initials spell the abbreviation. */
function initialsMatch(phrase: string, abbrev: string): boolean {
  const skipped = new Set([
    "of", "and", "the", "a", "an", "in", "for", "to", "with", "or", "on",
  ]);
  const letters = abbrev.replace(/[^A-Za-z]/g, "").toLowerCase();
  const words = phrase
    .split(/[\s/-]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter((w) => w && !skipped.has(w.toLowerCase()));
  return words.map((w) => w[0].toLowerCase()).join("") === letters;
}

export function unexpandedAbbreviations(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();

  for (const match of text.match(SHORT_FORM) ?? []) {
    if (match.length < 2) continue;
    // "VBACs" is VBAC. The plural was stripped before looking for the
    // bracketed introduction but not before checking the everyday set,
    // so every plural of a licensed abbreviation was reported —
    // VBACs, COCs, IUDs, ATSMs, EPAUs, CiPs.
    const singular = /[A-Za-z]s$/.test(match) ? match.slice(0, -1) : match;
    if (EVERYDAY_ABBREVIATIONS.has(match)) continue;
    if (EVERYDAY_ABBREVIATIONS.has(singular)) continue;
    if (EMPHASIS.has(match)) continue;
    if (NAMES.has(match) || NAMES.has(singular)) continue;
    if (STAGE.test(match)) continue;
    if (NOT_AN_ABBREVIATION.test(match)) continue;
    // Introduced somewhere in this question, in brackets after its
    // expansion \u2014 either alone, or as the head of a compound:
    // "levonorgestrel intrauterine device (LNG-IUD)" introduces LNG and
    // "(FDG-PET)" introduces FDG. Requiring the bare form flagged both
    // of those as unexplained when they had been explained perfectly.
    // "(ACUM)" introduces "ACUMs", so the bracket search uses the
    // singular too.
    const escaped = singular.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const introduced = new RegExp(
      "\\(" + "\\s*" +
        "(?:[A-Za-z0-9]+[-\u2011/])*" +
        escaped +
        "(?:[-\u2011/][A-Za-z0-9]+)*s?[\u00ae\u2122]?" +
        "\\s*" + "\\)"
    );
    if (introduced.test(text)) continue;
    // The other way round: "vNOTES (vaginal Natural Orifice
    // Transluminal Endoscopic Surgery)". A perfectly good introduction,
    // and not recognising it is worse than missing one — a repair pass
    // took it for an unexplained term and expanded it a second time,
    // leaving the expansion printed twice in a row.
    const reverse = new RegExp(escaped + "s?\\s*\\(([^()]{4,90})\\)");
    const after = text.match(reverse);
    if (after && initialsMatch(after[1], singular)) continue;
    found.add(match);
  }

  return Array.from(found).sort();
}
