// The baby's own care after birth is refused; the obstetrician's decisions for the baby are not
// (owner, 9 November 2026, on #2556-2558). Stems are shortened from real questions.
// Usage: npx tsx --conditions=react-server scripts/test-baby-care.mts
const { babyCareProblems } = await import("../src/lib/generation");

let failed = 0;
const check = (name: string, stem: string, answer: string, refused: boolean) => {
  const got = babyCareProblems(stem, answer).length > 0;
  if (got !== refused) failed++;
  console.log(`${got === refused ? "pass" : "FAIL"}  ${refused ? "refused" : "allowed"}: ${name}`);
};

// The neonatal team's care: refused.
check("#2557 infant regimen", "A woman living with HIV-1 breastfeeds; at 10 weeks her viral load rises. Her infant is well. What regimen should be started for the infant?", "Dolutegravir + lamivudine + zidovudine", true);
check("#2556 handed to the neonatal team, no question mark", "A woman with HIV-2 delivers at term. The neonatal team requests guidance on the initial combination PNP regimen to commence within 4 hours of birth.", "Raltegravir + lamivudine + zidovudine", true);
check("#2445 infant test schedule", "A woman living with HIV-1 delivers at term. What is the most appropriate molecular diagnostic testing schedule for this infant?", "HIV RNA PCR at birth, 4-6 weeks and 10-12 weeks", true);
check("#924 the neonate is the patient", "A neonate develops a chickenpox rash on day 5. What is the correct treatment regimen?", "Intravenous aciclovir 20 mg/kg every 8 hours for at least 7 days", true);
check("#717 the neonate is the patient, management", "A term neonate is delivered at 39 weeks. Her mother developed a chickenpox rash four days before delivery. What is the SINGLE most appropriate management?", "Administer Varitect CP and commence IV aciclovir", true);
check("#1251 how long the baby is watched", "She declines intrapartum antibiotics. For how long should her neonate be monitored for signs of early-onset GBS infection?", "12 hours", true);
check("#2543 at what age", "A woman with HIV has a baby at term. At what age should trimethoprim-sulfamethoxazole prophylaxis be started in the baby?", "At 4 weeks of age", true);
check("#2093 the neonate's head scan", "A neonate is born to a mother with ITP. The cord platelet count is 38. At what platelet count threshold should a cranial ultrasound be performed in this neonate?", "50 x 10⁹/l", true);

// The obstetrician's decisions and counselling: allowed.
check("oxytocin at delivery of the baby", "A woman has an elective CS at 39 weeks. The obstetrician asks which prophylactic uterotonic regimen should be used at delivery of the baby.", "Oxytocin 5 iu by slow intravenous injection", false);
check("radiation dose of a CT scan", "A woman at 32 weeks has a CTPA. The woman asks about the radiation dose her baby will receive from this scan.", "0.01–0.66 mGy", false);
check("vitamin K for the baby of a woman on carbamazepine", "A woman with epilepsy takes carbamazepine. What is the most appropriate management?", "Intramuscular vitamin K to the newborn", false);
check("place of birth with neonatal care", "She has a growth-restricted fetus at 32 weeks. She asks about plans for delivery.", "Management and monitoring with input from a tertiary level unit with highest level neonatal care", false);
check("a drug while breastfeeding", "She is breastfeeding and her depression has returned. What is the most appropriate management?", "Prescribe fluoxetine and continue breastfeeding with infant monitoring", false);
check("vasa praevia", "Vasa praevia bleeding at 37 weeks with fetal bradycardia. What is the essential immediate management?", "Emergency CS and neonatal resuscitation, including blood transfusion if required", false);
check("neonatal outcome of steroids", "She received steroids 10 days ago. Which neonatal outcome benefit is still likely to be seen if she gives birth now?", "No benefit is likely from the original course", false);
check("risk of neonatal hypoglycaemia", "She has type 1 diabetes. What is the risk of neonatal hypoglycaemia?", "48%", false);
check("intrapartum zidovudine", "A woman with HIV is in preterm labour with a viral load of 1200 copies/mL. When should intravenous zidovudine infusion be commenced?", "Intravenous zidovudine infusion commenced at presentation", false);
check("aspirin dose after a previous small baby", "Her first baby was born at the 4th centile. What dose of aspirin should she take?", "150 mg at night", false);

console.log(failed ? `${failed} failed` : "baby care: all passed");
if (failed) process.exit(1);
