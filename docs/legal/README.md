# Legal and compliance (Phase 11)

Branch `phase-11-legal`, 9 October 2026. Written for a sole trader established in **Ireland**, selling to Ireland, the UK, the rest of the EU and worldwide.

> This is careful groundwork, not legal advice. Items marked **[Solicitor]** need a solicitor's review before launch, and items marked **[Accountant]** need an accountant's.

Other documents here:
- [SOURCES.md](SOURCES.md): every content source, how it is used, and its licence status.
- [APP-STORES.md](APP-STORES.md): what Apple and Google will require of the planned apps.

## What changed

### Legal pages
- **Five pages:** Terms, Privacy, Refunds (now "Refunds, Cancellation & Withdrawal"), and two new ones, Cookies and Accessibility. All are rewritten, linked in the footer, and readable without the pilot access code.
- **Editable in Admin > Legal.** You fill in your trader details (legal name, postal address, contact email, country, and later company and VAT numbers) once, and every page quotes them. Until a detail is filled in, the pages show a highlighted gap such as "[legal name to be added]".
- Each page's wording can be edited there, with a preview. The editor takes plain text, never HTML, so nothing typed into it can run code. "Restore the default" brings back the wording in the code.

### Privacy (EU GDPR, Irish Data Protection Act 2018, UK GDPR)
- **The policy now matches the code.** The old one said personal data was not sent to the AI providers. In fact Ask Pinard questions are. It now names every provider, says where each processes data, and states what each AI feature receives.
- **Data minimisation:** the candidate's name is no longer sent to the AI when it writes reminder emails.
- **Download my data** on the Account page gives a file of everything linked to the account (rights of access and portability).
- **Deletion checked:** deleting an account removes everything linked to it. Feedback is kept but unlinked. A pilot review, and any testimonial published from it, now goes too.
- **Testimonials:** a published quote now comes down automatically if its author withdraws consent or changes the words.
- **Fixed a leak:** the hourly reminder job runs on GitHub, where the repository and its logs are public. It printed each candidate's account ID and the reason their email was or was not sent, which could include their email address. It now prints totals only.
- **Retention periods** set in the policy, with `supabase/phase44-retention.sql` written to enforce them. It is **not run**: see the checklist.

### Cookies (ePrivacy, Irish S.I. 336/2011, UK PECR)
- Only strictly necessary storage is used: the sign-in cookie, the pilot gate cookie, and the light/dark theme setting. There are no analytics or tracking. **No consent banner is needed**, and the Cookie Policy says why.

### Consumer law (Consumer Rights Act 2022 in Ireland, the EU Consumer Rights Directive, UK Consumer Contracts Regulations)
- **The 14-day full refund** replaces the 7-day promise everywhere: landing page, pricing, diagnostic results, FAQ, Terms and Refunds.
- **Withdraw from contract button.** Since 19 June 2026, EU law requires an online "withdraw from contract" function for the whole 14-day withdrawal period (Directive 2023/2673, in force in Ireland through S.I. 309 of 2026). The Account page now has one, with a confirmation step. It ends the plan at once, refunds the first payment in full through Stripe, and emails a confirmation to the candidate with a copy to you. Renewals are not covered.
- **Auto-renewal** is stated on every paid plan card ("Renews every month at this price until you cancel"), in the Terms, and in the FAQ.
- **Cancelling:** the button is now "Manage billing or cancel". Stripe's billing page allows cancellation (checked in test mode).
- **Price claim fixed:** "VAT included" was not accurate, because no VAT is being charged or accounted for. It now reads "The price shown is the total you pay." Stripe adds no tax at checkout.
- **Ask Pinard top-ups:** a box must be ticked before buying, consenting to immediate access and acknowledging that the right to withdraw ends once a question is used. Unused top-ups can be withdrawn within 14 days. Stripe's payment page repeats this.
- **Digital-content waiver for subscriptions is not needed.** You chose a full 14-day refund, which is more generous than the law: it would allow a charge for the days used.
- Removed the reference to the EU online dispute resolution platform, which closed in July 2025, and fixed a wrong cross-reference in the Terms.

### Medical and AI (EU AI Act, article 50)
- Every Ask Pinard answer is labelled "Written by AI", with a note that it is checked against its sources but not reviewed by a person.
- Under explanations in sessions and the sample, and above the mock review, a note says it is a revision aid, not clinical advice, drafted with AI and approved by a Member of the RCOG.
- The Terms explain how content is made, with a section on the use of AI.

### Intellectual property
- "Not affiliated with or endorsed by the RCOG" is now in the footer of every page, in the Terms (section 5) and on How it works.
- The sample page no longer says "Real MRCOG questions".
- The source table is in [SOURCES.md](SOURCES.md).

### Email
- Reminder emails have a one-click **Unsubscribe** link. They also carry the standard List-Unsubscribe headers, so Gmail and Apple Mail show their own Unsubscribe button. The link is signed, so nobody can unsubscribe someone else.
- The waitlist form says what joining agrees to, how long the address is kept, and links to the privacy policy. There are no marketing emails at present.

## Needs a solicitor

1. **[Solicitor] All five legal pages**, especially the limitation of liability, governing law, and the Refunds page's withdrawal wording.
2. **[Solicitor] Content licences** ([SOURCES.md](SOURCES.md)). TOG (466 articles, Wiley/RCOG) and the "SBA & EMQ" book used as style examples are high risk. RCOG material is a further 329 documents.
3. **[Solicitor] RCOG name:** the non-affiliation wording, and saying questions are "approved by a Member of the RCOG".
4. **[Solicitor] UK obligations for a business based in Ireland:**
   - whether a **UK GDPR representative** is needed (article 27);
   - whether the **ICO data protection fee** applies;
   - the UK subscription rules in the Digital Markets, Competition and Consumers Act, which start in **January 2027** (renewal reminders and cooling-off on renewals).
5. **[Solicitor] Reminder emails** are on by default for every candidate, on the basis of the contract and legitimate interest, with one-click opt-out. Confirm that is right, as opposed to asking for consent.
6. **[Solicitor] The top-up waiver:** confirm that a ticked box plus the Stripe page note is enough consent and acknowledgement. The law also asks for confirmation "on a durable medium", such as an email.
7. **[Solicitor] International transfers:** the reliance on the Data Privacy Framework and Standard Contractual Clauses for Vercel, AWS, Voyage and Resend. Also whether a transfer impact assessment is needed.
8. **[Solicitor] Terms for customers outside Europe** (US, Canada, Australia, Gulf states, India, South Africa and others): local consumer laws can override parts of the Terms.

## Needs an accountant

- **[Accountant] VAT on digital services:**
  - Irish VAT registration threshold for services (€42,500);
  - the EU One-Stop Shop once EU sales to other countries pass €10,000 a year;
  - **UK VAT, which a non-UK seller of digital services to UK consumers must register for from the first sale**;
  - other countries' digital-services taxes (Norway, Switzerland, Australia and others).
  - Whether to turn on **Stripe Tax** (a Stripe setting; I will not change it without your approval). If VAT becomes due, prices either rise or VAT comes out of the current price, and the pricing wording changes.
- **[Accountant] Sole trader registration** with Revenue, and a business name registration with the CRO if you trade as "Pinard".
- **[Accountant] Keeping records:** six years, which the privacy policy states.

## Open items (not done in this phase)

- **No automatic deletion of accounts unused for a long time.** The policy says data is kept "while your account is open". A rule such as "deleted after three years without signing in, with a warning email first" is a decision for you.
- **Nothing checks that generated questions do not resemble the style examples.** That needs a decision once the solicitor has advised on the examples.
- **Voyage AI** may use API data to train its models unless the account opts out. The privacy policy therefore makes no promise about Voyage and training. Once you opt out, I'll add that sentence.
- **AI processing location:** Claude is called with the "global" routing prefix, so requests can be processed in any AWS region. The "eu." prefix keeps them in Europe for about 10% more per call. Your decision.
- **Vercel functions** run in its default region (Washington DC) while the database is in London. Moving them to Dublin or London keeps data in Europe and makes pages faster. This is a Vercel setting change, so it needs your approval.
- **Accessibility:** some question figures (charts, traces) lack full text descriptions, and the statement says so.
- **The withdrawal refund has not been tested end to end.** Both test subscriptions are older than 14 days. Test it on a preview deployment with a Stripe test card before launch.
- **The UK subscription rules from January 2027** need renewal reminder emails and possibly changes to annual renewals. Plan this in the autumn.
- **Store apps:** see [APP-STORES.md](APP-STORES.md).

## Pre-launch checklist: things only you can do

**Before taking any payment**
- [ ] Fill in **Admin > Legal**: legal name, postal address and contact email. Consumer law requires them.
- [ ] Make sure the contact email (default **support@pinardapp.com**) receives mail and is read. Withdrawal requests and data requests have legal deadlines.
- [ ] Solicitor review: the items above.
- [ ] Accountant: VAT and registrations, above.
- [ ] Decide on the content licences: approach RCOG and Wiley, or remove material.

**Settings (each needs your hands, or your approval for me to do it)**
- [ ] Run `supabase/phase44-retention.sql` in the Supabase SQL editor, to approve automatic deletion of:
  - Ask failure records older than 12 months;
  - rate-limit records older than 30 days;
  - waitlist entries older than 12 months.
  Until it runs, the policy promises limits the system does not enforce.
- [ ] **Voyage AI:** opt out of training on your data (account settings, or email Voyage), then tell me.
- [ ] **Stripe (live mode):**
  - confirm the customer portal allows cancelling (Settings > Billing > Customer portal);
  - turn on emails about upcoming renewals (Settings > Billing > Subscriptions and emails).
- [ ] **GitHub:** if reminder emails were ever switched on, open Actions > Daily reminders. Delete the logs of runs before this change, which may show candidate IDs.
- [ ] Decide on the AI region ("eu." prefix) and the Vercel function region.

**Registrations**
- [ ] **Ireland:** there is no general registration with the Data Protection Commission under GDPR. Nothing to file unless your solicitor says otherwise.
- [ ] **UK:** ICO fee and UK representative, per the solicitor.
- [ ] Revenue and CRO, per the accountant.

**At public launch**
- [ ] Set `NEXT_PUBLIC_LAUNCHED=true` in Vercel. This removes "noindex" and opens the sitemap.
- [ ] Turn Supabase "Allow new users to sign up" back on.
- [ ] Make sure `BETA_FULL_ACCESS` is not `true` in Production.
- [ ] Supabase auth email templates (a Supabase settings change).
- [ ] Remove the pilot access code (`SITE_GATE_PASSWORD`). Then update the Cookie Policy to drop the `pinard_gate` row.

**Promises in the Terms you keep by hand**
- Reply to messages within two working days.
- Email subscribers **30 days before** any price change, or any important change to the Terms.
- Refund withdrawals within 14 days. The button does this automatically; email requests you process in Stripe.
