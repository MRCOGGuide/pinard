/**
 * Prove appliedBandProblems catches the 1153 fault and stays quiet on
 * the questions that only looked like it.
 */

import { appliedBandProblems } from "../src/lib/generation";
import { parseExplanationTable } from "../src/lib/explanationTable";

type Case = { name: string; stem: string; table: unknown; expect: boolean };

const cases: Case[] = [
  {
    name: "1153 as it was — 58-year-old, 61-74 band applied",
    stem: "A 58-year-old woman with a BMI of 32 is admitted for elective total laparoscopic hysterectomy for fibroids. Her surgery lasts 80 minutes under general anaesthesia.",
    table: {
      caption: "VTE risk score components applicable to this patient",
      columns: ["Risk factor", "Category", "Score"],
      rows: [
        ["Age", "41–60 years", "+1"],
        ["Age", "61–74 years", "+2"],
        ["BMI", "≥30", "+1"],
        ["BMI", "≥40", "+2"],
        ["Duration of surgery", "<60 minutes", "+1"],
        ["Duration of surgery", ">60 minutes", "+2"],
      ],
      highlight: [1, 2, 5],
    },
    expect: true,
  },
  {
    name: "1153 as repaired — 63-year-old",
    stem: "A 63-year-old woman with a BMI of 32 is admitted for elective total laparoscopic hysterectomy for a 10-week-size fibroid uterus. Her surgery lasts 80 minutes under general anaesthesia.",
    table: {
      caption: "VTE risk score components relevant to this patient",
      columns: ["Risk factor", "Category", "Score"],
      rows: [
        ["Age", "41–60 years", "+1"],
        ["Age", "61–74 years", "+2"],
        ["BMI", "≥30", "+1"],
        ["BMI", "≥40", "+2"],
        ["Duration of surgery", "<60 minutes", "+1"],
        ["Duration of surgery", ">60 minutes", "+2"],
        ["Pelvic mass", "Significant size (e.g. fibroid >12 weeks)", "+1"],
      ],
      highlight: [1, 2, 5],
    },
    expect: false,
  },
  {
    name: "the wrong duration row applied",
    stem: "A 63-year-old woman with a BMI of 32. Her surgery lasts 80 minutes.",
    table: {
      caption: "VTE risk score components",
      columns: ["Risk factor", "Category", "Score"],
      rows: [
        ["Age", "61–74 years", "+2"],
        ["Duration of surgery", "<60 minutes", "+1"],
      ],
      highlight: [0, 1],
    },
    expect: true,
  },
  {
    name: "the wrong BMI row applied",
    stem: "A 63-year-old woman with a BMI of 32.",
    table: {
      caption: "VTE risk score components",
      columns: ["Risk factor", "Category", "Score"],
      rows: [
        ["BMI", "≥30", "+1"],
        ["BMI", "≥40", "+2"],
      ],
      highlight: [1],
    },
    expect: true,
  },
  {
    name: "#78 — a delivery-timing gestation is not the woman's gestation",
    stem: "A 33-year-old woman is seen in the antenatal clinic at 22 weeks of gestation. She was diagnosed with intrahepatic cholestasis of pregnancy at 20 weeks. Her most recent peak total serum bile acid concentration is 52 micromol/L.",
    table: {
      caption: "Stillbirth risk by peak bile acid concentration in singleton ICP",
      columns: ["Peak bile acid concentration", "Prevalence of stillbirth", "Planned birth"],
      rows: [
        ["19–39 micromol/L (mild ICP)", "0.13% — unchanged from background", "Consider by 40 weeks"],
        ["40–99 micromol/L (moderate ICP)", "0.28% — similar to background until 38–39 weeks", "Consider at 38–39 weeks"],
        ["≥100 micromol/L (severe ICP)", "3.44% — higher than background", "Consider at 35–36 weeks"],
      ],
      highlight: 1,
    },
    expect: false,
  },
  {
    name: "#278 — the stem quotes the band itself, there is no patient",
    stem: "According to UKMEC 2025, what category applies to initiation of a Cu-IUD in a woman who is between 48 hours and 4 weeks postpartum?",
    table: {
      caption: "UKMEC categories for IUD insertion by postpartum interval",
      columns: ["Postpartum interval", "Cu-IUD", "LNG-IUD"],
      rows: [
        ["0 to ≤48 hours", "1", "1"],
        ["48 hours to <4 weeks", "3", "3"],
        ["≥4 weeks", "1", "1"],
      ],
      highlight: 1,
    },
    expect: false,
  },
  {
    name: "no highlight, no claim to check",
    stem: "A 58-year-old woman with a BMI of 32.",
    table: {
      caption: "VTE risk score components",
      columns: ["Risk factor", "Category", "Score"],
      rows: [
        ["Age", "61–74 years", "+2"],
        ["BMI", "≥30", "+1"],
      ],
    },
    expect: false,
  },
];

let failed = 0;
for (const c of cases) {
  const problems = appliedBandProblems(c.stem, parseExplanationTable(c.table));
  const flagged = problems.length > 0;
  const ok = flagged === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${c.name}`);
  for (const p of problems) console.log(`        ${p}`);
}
console.log(`\n${cases.length - failed} of ${cases.length} passed`);
if (failed) process.exit(1);
