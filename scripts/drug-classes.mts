/**
 * Drugs named by what they do rather than by what they are.
 *
 * Shared by the audit that finds explanations naming only a class and
 * the repair that puts the drug beside it, so the two cannot drift.
 */

/** Matches a class word anywhere in a sentence. */
export const DRUG_CLASS =
  /\b(anti-?arrhythmics?|anti-?hypertensives?|antibiotics?|antimicrobials?|anticoagulants?|anticoagulation|thromboprophylaxis|anticonvulsants?|antiepileptics?|anti-?emetics?|antifungals?|antivirals?|antiretrovirals?|antidepressants?|antipsychotics?|antiplatelets?|antifibrinolytics?|thrombolytics?|thrombolysis|uterotonics?|tocolytics?|tocolysis|corticosteroids?|steroids?|progestogens?|oestrogens?|prostaglandins?|GnRH (?:agonists?|analogues?|antagonists?)|aromatase inhibitors?|bisphosphonates?|immunosuppress(?:ion|ants?|ive therapy)|opioids?|analgesics?|analgesia|laxatives?|statins?|beta-?blockers?|calcium[- ]channel blockers?|diuretics?|local anaesthetics?|chemotherapy|antimuscarinics?|anticholinergics?|hypoglycaemic agents?|iron (?:therapy|supplementation)|antihistamines?|dopamine agonists?|SSRIs?|selective serotonin reuptake inhibitors?)\b/i;

/**
 * A single word that is itself a class or a class's abbreviation.
 *
 * A bracket whose every word is on this list has named nothing: the
 * repair once answered "immunosuppressive therapy (corticosteroids)"
 * and "HRT should be added (HRT)". The registrar still has nothing to
 * write on the chart.
 */
export const CLASS_WORD =
  /^(anti-?arrhythmics?|anti-?hypertensives?|antibiotics?|antimicrobials?|anticoagulants?|anticoagulation|thromboprophylaxis|anticonvulsants?|antiepileptics?|anti-?emetics?|antifungals?|antivirals?|antiretrovirals?|antidepressants?|antipsychotics?|antiplatelets?|antifibrinolytics?|thrombolytics?|thrombolysis|uterotonics?|tocolytics?|tocolysis|corticosteroids?|steroids?|progestogens?|oestrogens?|prostaglandins?|aromatase|inhibitors?|agonists?|analogues?|antagonists?|bisphosphonates?|immunosuppression|immunosuppressants?|opioids?|analgesics?|analgesia|laxatives?|statins?|beta-?blockers?|blockers?|diuretics?|chemotherapy|antimuscarinics?|anticholinergics?|antihistamines?|SSRIs?|SNRIs?|LMWH|UFH|HRT|NACT|NSAIDs?|heparins?|GnRH|therapy|treatment|prophylaxis|regimens?|preparations?|supplementation)$/i;
