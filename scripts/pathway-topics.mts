/**
 * The pathways to draw out of the library (owner's brief, 11 October
 * 2026, part 2), with the documents each is built from.
 *
 * `docs` are the primary sources, read in full where they fit (the
 * build reads the best-matching passages of a longer one). `queries`
 * search the whole library as well, so a second source that adds to or
 * disagrees with the first is found. A topic with no primary document is
 * one the library has no dedicated guidance for: it is still searched,
 * and if the passages cannot support it, it is recorded as not in the
 * sources rather than filled from elsewhere.
 *
 * Document ids are as uploaded on 11 October 2026. Where the library
 * holds the same guideline twice (ESC 92 and 1012, BHIVA 5 and 53, the
 * BSH red cell antibody guideline 7 and 36), only one copy is listed.
 */
import type { PathwayArea } from "../src/lib/pathway-shape";

export type PathwayTopic = {
  slug: string;
  name: string;
  area: PathwayArea;
  docs: number[];
  queries: string[];
  /** Plain words a woman's risk factors are matched against. */
  triggers: string[];
};

export const PATHWAY_TOPICS: PathwayTopic[] = [
  // The owner's starter list.
  {
    slug: "aspirin-pre-eclampsia",
    name: "Low-dose aspirin for pre-eclampsia prevention",
    area: "obstetric",
    docs: [37],
    queries: ["aspirin to reduce the risk of pre-eclampsia: high and moderate risk factors and dose", "aspirin from 12 weeks until birth"],
    triggers: ["pre-eclampsia risk", "chronic hypertension", "previous pre-eclampsia", "first pregnancy", "age 40 or over", "BMI 35 or over", "multiple pregnancy", "diabetes", "kidney disease", "autoimmune disease", "family history of pre-eclampsia", "pregnancy interval over 10 years"],
  },
  {
    slug: "preterm-birth-prevention",
    name: "Preterm birth prevention: referral and management",
    area: "obstetric",
    docs: [72, 96],
    queries: ["preterm birth prevention clinic referral criteria history of preterm birth or late miscarriage", "transvaginal cervical length screening progesterone cerclage"],
    triggers: ["previous preterm birth", "previous late miscarriage", "previous cervical surgery", "short cervix", "cerclage", "uterine anomaly"],
  },
  {
    slug: "gestational-diabetes",
    name: "Gestational diabetes: screening and management",
    area: "obstetric",
    docs: [32],
    queries: ["gestational diabetes risk factors screening oral glucose tolerance test", "gestational diabetes postnatal follow-up and future risk of type 2 diabetes"],
    triggers: ["BMI over 30", "previous gestational diabetes", "previous macrosomic baby", "family history of diabetes", "ethnicity with high prevalence of diabetes", "glycosuria"],
  },
  {
    slug: "pre-existing-diabetes",
    name: "Pre-existing diabetes in pregnancy",
    area: "medical",
    docs: [32],
    queries: ["type 1 and type 2 diabetes preconception folic acid 5 mg HbA1c", "diabetes in pregnancy timing of birth retinal assessment"],
    triggers: ["type 1 diabetes", "type 2 diabetes"],
  },
  {
    slug: "vte-prophylaxis",
    name: "VTE risk assessment and thromboprophylaxis",
    area: "obstetric",
    docs: [47],
    queries: ["antenatal and postnatal thromboprophylaxis risk factor score LMWH dose by weight", "previous VTE thrombophilia thromboprophylaxis in pregnancy"],
    triggers: ["previous VTE", "thrombophilia", "BMI 30 or over", "age over 35", "parity 3 or more", "smoker", "immobility", "IVF", "multiple pregnancy", "pre-eclampsia", "caesarean birth", "PPH", "medical comorbidity"],
  },
  {
    slug: "vte-acute",
    name: "Suspected VTE in pregnancy: diagnosis and treatment",
    area: "obstetric",
    docs: [50],
    queries: ["suspected DVT or PE in pregnancy investigation and therapeutic LMWH"],
    triggers: ["suspected DVT", "suspected PE", "leg swelling", "breathlessness", "chest pain"],
  },
  {
    slug: "smoking",
    name: "Smoking in pregnancy",
    area: "obstetric",
    docs: [990, 749],
    queries: ["smoking cessation in pregnancy carbon monoxide testing referral nicotine replacement", "smoking in pregnancy risks to the baby fetal growth"],
    triggers: ["smoker", "vaping", "carbon monoxide"],
  },
  {
    slug: "multiple-pregnancy",
    name: "Multiple pregnancy",
    area: "obstetric",
    docs: [40, 469, 84],
    queries: ["twin pregnancy chorionicity antenatal care scans timing of birth", "monochorionic twins twin-to-twin transfusion surveillance"],
    triggers: ["twins", "triplets", "multiple pregnancy", "monochorionic", "dichorionic"],
  },
  {
    slug: "red-cell-antibodies",
    name: "Red cell antibodies and fetal anaemia",
    area: "obstetric",
    docs: [36],
    queries: ["red cell antibodies anti-D anti-c anti-K titre monitoring referral to fetal medicine MCA Doppler", "fetal anaemia surveillance and intrauterine transfusion"],
    triggers: ["red cell antibodies", "alloimmunisation", "anti-D", "anti-c", "anti-K", "fetal anaemia", "previous haemolytic disease"],
  },
  {
    slug: "rhd-negative",
    name: "Rh D negative women: anti-D prophylaxis",
    area: "obstetric",
    docs: [3],
    queries: ["routine antenatal anti-D prophylaxis dose timing sensitising events Kleihauer", "cell-free fetal DNA fetal RHD genotyping"],
    triggers: ["Rh D negative", "anti-D prophylaxis", "sensitising event"],
  },
  {
    slug: "high-risk-clinic-referral",
    name: "Referral to the consultant-led high-risk antenatal clinic",
    area: "obstetric",
    docs: [],
    queries: ["referral for consultant-led antenatal care criteria at booking", "women who need additional care in pregnancy medical conditions referral"],
    triggers: ["high-risk pregnancy", "consultant-led care"],
  },
  {
    slug: "fetal-growth",
    name: "Fetal growth screening (SGA and FGR)",
    area: "obstetric",
    docs: [48],
    queries: ["risk assessment for fetal growth restriction at booking serial growth scans uterine artery Doppler", "small for gestational age fetus surveillance and timing of birth"],
    triggers: ["previous SGA baby", "smoker", "age 40 or over", "BMI over 35", "pre-eclampsia", "fibroids", "low PAPP-A", "fundal height"],
  },
  {
    slug: "fetal-medicine-referral",
    name: "Referral to fetal medicine",
    area: "obstetric",
    docs: [],
    queries: ["referral to a fetal medicine specialist criteria", "fetal anomaly on ultrasound referral fetal medicine unit"],
    triggers: ["fetal anomaly", "fetal medicine"],
  },
  {
    slug: "polyhydramnios",
    name: "Polyhydramnios",
    area: "obstetric",
    docs: [466],
    queries: ["polyhydramnios causes investigation and management timing of birth"],
    triggers: ["polyhydramnios", "large for dates", "amniotic fluid"],
  },
  {
    slug: "screening-result-high-risk",
    name: "High-risk first trimester screening or NIPT result",
    area: "obstetric",
    docs: [52, 4, 364],
    queries: ["higher chance screening result trisomy 21 offer NIPT or invasive testing", "CVS and amniocentesis miscarriage risk counselling"],
    triggers: ["higher chance screening result", "high-risk NIPT", "trisomy 21", "trisomy 18", "trisomy 13"],
  },
  {
    slug: "hiv",
    name: "HIV in pregnancy",
    area: "medical",
    docs: [53],
    queries: ["HIV in pregnancy antiretroviral therapy viral load mode of delivery", "HIV infant post-exposure prophylaxis and infant feeding"],
    triggers: ["HIV"],
  },
  {
    slug: "hepatitis-b",
    name: "Hepatitis B in pregnancy",
    area: "medical",
    docs: [],
    queries: ["hepatitis B in pregnancy screening viral load tenofovir neonatal vaccination immunoglobulin", "hepatitis B coinfection HIV pregnancy"],
    triggers: ["hepatitis B"],
  },
  {
    slug: "hepatitis-c",
    name: "Hepatitis C in pregnancy",
    area: "medical",
    docs: [],
    queries: ["hepatitis C in pregnancy screening vertical transmission mode of delivery breastfeeding"],
    triggers: ["hepatitis C"],
  },
  {
    slug: "chickenpox",
    name: "Chickenpox in pregnancy",
    area: "medical",
    docs: [54],
    queries: ["chickenpox exposure in pregnancy VZIG aciclovir fetal varicella syndrome"],
    triggers: ["chickenpox", "varicella", "shingles"],
  },
  {
    slug: "group-b-streptococcus",
    name: "Group B streptococcus",
    area: "obstetric",
    docs: [55],
    queries: ["GBS intrapartum antibiotic prophylaxis indications benzylpenicillin"],
    triggers: ["GBS", "group B streptococcus", "previous baby with GBS disease"],
  },
  {
    slug: "genital-herpes",
    name: "Genital herpes in pregnancy",
    area: "medical",
    docs: [57],
    queries: ["primary genital herpes in third trimester caesarean aciclovir suppression from 36 weeks"],
    triggers: ["genital herpes", "HSV"],
  },
  {
    slug: "syphilis",
    name: "Syphilis in pregnancy",
    area: "medical",
    docs: [701],
    queries: ["syphilis screening in pregnancy treatment benzathine penicillin congenital syphilis"],
    triggers: ["syphilis"],
  },
  {
    slug: "cytomegalovirus",
    name: "Cytomegalovirus in pregnancy",
    area: "medical",
    docs: [386],
    queries: ["congenital cytomegalovirus primary infection in pregnancy diagnosis valaciclovir"],
    triggers: ["CMV", "cytomegalovirus"],
  },
  {
    slug: "obesity",
    name: "Raised BMI in pregnancy",
    area: "obstetric",
    docs: [28],
    queries: ["obesity in pregnancy folic acid 5 mg vitamin D GTT anaesthetic review", "BMI 40 or over antenatal care and birth planning"],
    triggers: ["BMI 30 or over", "BMI 35 or over", "BMI 40 or over", "obesity"],
  },
  {
    slug: "very-advanced-maternal-age",
    name: "Advanced and very advanced maternal age",
    area: "obstetric",
    docs: [678, 436],
    queries: ["women aged 40 or over in pregnancy stillbirth risk induction of labour at 39 weeks", "very advanced maternal age 45 and over pregnancy risks"],
    triggers: ["age 40 or over", "age 45 or over", "advanced maternal age"],
  },
  {
    slug: "declining-blood",
    name: "Women who decline blood products",
    area: "obstetric",
    docs: [25],
    queries: ["Jehovah's Witness declining blood transfusion advance directive cell salvage", "optimising haemoglobin before birth iron"],
    triggers: ["Jehovah's Witness", "declines blood products", "refuses transfusion"],
  },
  // Medical conditions in pregnancy the sources cover.
  {
    slug: "chronic-hypertension",
    name: "Chronic hypertension in pregnancy",
    area: "medical",
    docs: [37],
    queries: ["chronic hypertension in pregnancy antihypertensive treatment target blood pressure timing of birth", "postnatal antihypertensive treatment breastfeeding"],
    triggers: ["chronic hypertension", "essential hypertension", "on antihypertensives"],
  },
  {
    slug: "pre-eclampsia",
    name: "Gestational hypertension and pre-eclampsia",
    area: "obstetric",
    docs: [37],
    queries: ["pre-eclampsia assessment admission blood tests PlGF timing of birth magnesium sulfate", "gestational hypertension management"],
    triggers: ["pre-eclampsia", "gestational hypertension", "raised blood pressure", "proteinuria"],
  },
  {
    slug: "epilepsy",
    name: "Epilepsy in pregnancy",
    area: "medical",
    docs: [33],
    queries: ["epilepsy in pregnancy antiepileptic drugs valproate folic acid 5 mg", "epilepsy seizure in labour and postnatal care"],
    triggers: ["epilepsy", "antiepileptic drugs", "seizures"],
  },
  {
    slug: "thyroid",
    name: "Thyroid disorders in pregnancy",
    area: "medical",
    docs: [41],
    queries: ["hypothyroidism in pregnancy levothyroxine dose increase TSH targets", "hyperthyroidism Graves disease in pregnancy antithyroid drugs TRAb fetal monitoring"],
    triggers: ["hypothyroidism", "hyperthyroidism", "Graves disease", "levothyroxine", "thyroid"],
  },
  {
    slug: "cardiac-disease",
    name: "Heart disease in pregnancy",
    area: "medical",
    docs: [92],
    queries: ["modified WHO classification of maternal cardiovascular risk pregnancy heart team", "cardiac disease in pregnancy mode of delivery and anticoagulation for mechanical valves"],
    triggers: ["heart disease", "congenital heart disease", "mechanical valve", "cardiomyopathy", "arrhythmia", "aortopathy"],
  },
  {
    slug: "sickle-cell",
    name: "Sickle cell disease in pregnancy",
    area: "medical",
    docs: [91],
    queries: ["sickle cell disease in pregnancy preconception hydroxycarbamide folic acid aspirin thromboprophylaxis", "sickle crisis in pregnancy"],
    triggers: ["sickle cell disease"],
  },
  {
    slug: "thalassaemia",
    name: "Thalassaemia in pregnancy",
    area: "medical",
    docs: [90],
    queries: ["thalassaemia pregnancy preconception cardiac T2* iron chelation partner screening"],
    triggers: ["thalassaemia"],
  },
  {
    slug: "inherited-bleeding-disorders",
    name: "Inherited bleeding disorders in pregnancy",
    area: "medical",
    docs: [93],
    queries: ["von Willebrand disease haemophilia carrier pregnancy factor levels regional anaesthesia delivery"],
    triggers: ["von Willebrand disease", "haemophilia carrier", "bleeding disorder"],
  },
  {
    slug: "thrombocytopenia",
    name: "Thrombocytopenia and ITP in pregnancy",
    area: "medical",
    docs: [1013],
    queries: ["immune thrombocytopenia in pregnancy platelet count thresholds treatment delivery regional anaesthesia"],
    triggers: ["ITP", "thrombocytopenia", "low platelets"],
  },
  {
    slug: "obstetric-cholestasis",
    name: "Intrahepatic cholestasis of pregnancy",
    area: "medical",
    docs: [81],
    queries: ["intrahepatic cholestasis of pregnancy bile acids timing of birth ursodeoxycholic acid"],
    triggers: ["itching", "obstetric cholestasis", "raised bile acids"],
  },
  {
    slug: "perinatal-mental-health",
    name: "Mental health in pregnancy and after birth",
    area: "medical",
    docs: [175],
    queries: ["antenatal and postnatal mental health referral to perinatal mental health services", "bipolar disorder pregnancy lithium valproate postpartum psychosis"],
    triggers: ["depression", "anxiety", "bipolar disorder", "psychosis", "previous postpartum psychosis", "mental health"],
  },
];
