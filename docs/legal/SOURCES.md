# Content sources and licences

Phase 11, 9 October 2026. Built from a read-only count of the source library (`content_documents`, 951 documents) and the style examples (`example_questions`, 298), grouped by publisher from each document's reference.

**Every row marked Medium or High needs a solicitor's view before launch.** This table records what we hold and how we use it. It is not legal advice on whether that use is allowed.

## How the material is used

The same way for every source:

1. **Stored.** The full text of each document is uploaded to our database (Supabase, London) and split into passages.
2. **Indexed.** Each passage is sent to Voyage AI (United States) to make a search index.
3. **Read by the AI.** Relevant passages are sent to Claude (through Amazon Web Services) to write questions and explanations, and to answer Ask Pinard questions.
4. **Shown to candidates.** Candidates see Pinard's own questions and explanations, which paraphrase the guidance, with the document's title and reference cited. They do not see the source text itself. Two exceptions to check:
   - **Similar values** shows short factual statements lifted from the guidance. The owner can switch it off in Admin.
   - **Ask Pinard answers** may stay close to the source wording when a passage is quoted closely.

Copying a whole work into a database and sending it to AI services is itself a use the rights holder may need to permit, even though candidates never see the original. In the EU, the text-and-data-mining exception (Article 4, Digital Single Market Directive) allows commercial mining of lawfully accessed works only where the rights holder has not opted out. Large publishers usually have opted out.

## The table

| Source | Documents | Copyright holder | Licence we hold | Risk | Notes |
|---|---|---|---|---|---|
| **TOG**, The Obstetrician & Gynaecologist (review articles) | 466 | RCOG; published by Wiley | None known | **High** | Subscription journal. Nearly half the library. Needs a licence from Wiley/RCOG (for example through RightsLink), or the articles come out of the library. |
| RCOG Green-top Guidelines | 71 | RCOG | None known | **Medium–High** | Free to read on rcog.org.uk, but RCOG reserves rights. Commercial reuse, including building a paid product on the text, normally needs written permission. |
| RCOG Scientific Impact Papers | 63 | RCOG | None known | **Medium–High** | As above. |
| RCOG Consent Advice | 8 | RCOG | None known | **Medium–High** | As above. |
| Other RCOG documents (reports, statements, curricula) | 187 | RCOG | None known | **Medium–High** | As above. Ask RCOG once for all RCOG material. |
| NICE guidelines | 20 | NICE | None known | **Medium** | NICE content is reusable under its own terms in the UK. Commercial use, and use outside the UK, need a licence application to NICE. |
| Specialist societies: FSRH, CoSRH, BASHH, BHIVA, BGCS, BAGP, BSGE, ESHRE, BMS, British Society for Haematology, Intensive Care Society, RCPsych, RCPath, RCGP/RCP/ABN, AoMRC | about 45 | Each society | None known | **Medium** | Usually free to read for personal or educational use. Commercial reuse terms vary: check each, or ask. |
| UK government: GOV.UK, UKHSA, PHE, NHS England, CQC, HSIB, NHS, Human Tissue Authority, Parliamentary reports (Ockenden, IMMDS, HC papers), UK NSC | about 30 | Crown or the body | Open Government Licence (most) | **Low** | The OGL allows commercial reuse with attribution, which the citations give. Check each document is under OGL and not an exception. |
| MBRRACE-UK, NMPA, HQIP reports | about 15 | HQIP and the commissioning bodies | None known | **Medium** | HQIP reports allow reuse with acknowledgement, but commercial reuse should be checked. |
| GMC guidance | 8 | GMC | None known | **Low–Medium** | Free guidance. Reuse with acknowledgement is usually allowed; confirm for a paid product. |
| Journal articles: BJOG, BMJ, BMJ Open, BMJ Quality & Safety, NEJM, Cochrane, Int J Gynecol Obstet, Arch Dis Child, Soc Sci Med, BMC journals, Facts Views Vis ObGyn | about 20 | Each publisher, or authors under Creative Commons | Open-access ones: CC licence; others: none | **Medium–High** | Open-access articles may be CC BY (commercial use allowed with credit) or CC BY-NC (no commercial use). Paywalled ones (NEJM, Cochrane, BJOG) need permission or removal. |
| Charities: Miscarriage Association, Cancer Research UK | a few | Each charity | None known | **Low–Medium** | Check their reuse terms. |
| **Style examples** labelled "SBA & EMQ" | 278 of the 298 examples | The book's publisher and authors (title to confirm) | None known | **High** | A commercial book of practice questions. Never shown to candidates, but stored in full and sent to the AI as examples of format. The prompt says to copy form only, never content, but nothing checks automatically that a generated question does not resemble an example. Safest: replace with examples written by the owner. |
| Other style examples (RCOG, TOG, NICE, Cancer Research UK references) | 20 | As above | None known | **Medium** | As above. |
| Past examination papers | 0 found | RCOG | None | **High if used** | Nothing in the library is labelled as a past paper. RCOG examination questions are confidential; none should ever be added. |

## What to ask the solicitor

1. Whether storing full texts, indexing them with a US provider and using them to generate paid revision content needs permission from each publisher, given the TDM opt-outs.
2. Whether Pinard's paraphrased questions and explanations are derivative works of the guidance.
3. The risk from the "SBA & EMQ" book used as style examples, and whether to replace it.
4. Whether to approach RCOG and Wiley for a licence (RCOG material plus TOG is about 80% of the library), and on what terms.
5. Wording of the RCOG non-affiliation statement, and whether "approved by a Member of the RCOG" is acceptable use of the RCOG's name.
