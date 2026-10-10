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
- **Retention periods** set in the policy, and enforced by `supabase/phase44-retention.sql`, which the owner ran on 9 October 2026. The hourly reminder job now clears expired rows.
- **Voyage AI** opted out of training on our data (owner, 9 October 2026); the privacy policy now says so.

### Cookies (ePrivacy, Irish S.I. 336/2011, UK PECR)
- Only strictly necessary storage is used: the sign-in cookie, the pilot gate cookie, and the light/dark theme setting. There are no analytics or tracking. **No consent banner is needed**, and the Cookie Policy says why.

### Consumer law (Consumer Rights Act 2022 in Ireland, the EU Consumer Rights Directive, UK Consumer Contracts Regulations)
- **The 14-day full refund** replaces the 7-day promise everywhere: landing page, pricing, diagnostic results, FAQ, Terms and Refunds.
- **Withdraw from contract button.** Since 19 June 2026, EU law requires an online "withdraw from contract" function for the whole 14-day withdrawal period (Directive 2023/2673, in force in Ireland through S.I. 309 of 2026). The Account page now has one, with a confirmation step. It ends the plan at once, refunds the first payment in full through Stripe, and emails a confirmation to the candidate with a copy to you. Renewals are not covered.
- **Auto-renewal** is stated on every paid plan card ("Renews every month at this price until you cancel"), in the Terms, and in the FAQ.
- **Cancelling:** the button is now "Manage billing or cancel". Stripe's billing page allows cancellation (checked in test mode).
- **Price claim fixed:** "VAT included" was not accurate, because no VAT was being charged or accounted for. It now reads "The price shown is the total you pay, including any VAT."
- **VAT at checkout, ready to switch on.** With `STRIPE_TAX_ENABLED=true`, checkout asks for a billing address and Stripe Tax works out the VAT for the countries where you are registered. Every price is VAT-inclusive, so a buyer anywhere pays exactly the advertised price and the VAT comes out of it. Tested in Stripe test mode, on £16.99:
  - Ireland: £3.18 VAT (23%);
  - UK: £2.83 (20%);
  - Germany: £2.71 (19%);
  - US and India: none, because no registration exists there.
  The test account now has test registrations for Ireland (EU One-Stop Shop) and the UK, defaults of "inclusive" and "electronically supplied services", and a VAT-inclusive top-up price. None of this touches the live account.
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
- **Similarity check:** the generator discards any new question whose stem or explanation echoes one of the style-book examples, and logs it. The existing bank of 2,014 questions has none (see [SOURCES.md](SOURCES.md)).
- At the owner's request, "TOG" is no longer named in the marketing copy (landing page, How it works, About, FAQ), and the candidates' "TOG Articles" section is now **"High-Impact Articles"**. Individual questions still cite their source article (for example "TOG 2024, Issue 3"), as a reference list does.
- The source table is in [SOURCES.md](SOURCES.md).

### Email
- Reminder emails have a one-click **Unsubscribe** link. They also carry the standard List-Unsubscribe headers, so Gmail and Apple Mail show their own Unsubscribe button. The link is signed, so nobody can unsubscribe someone else.
- The waitlist form says what joining agrees to, how long the address is kept, and links to the privacy policy. There are no marketing emails at present.

## Changes from the four-tier pricing (10 October 2026)

- **Stripe Managed Payments is now the seller.** Link (Stripe) is the merchant of record: it sells to the customer, takes payment, and collects and pays tax in more than 80 countries. The Terms, Refunds and Privacy pages say so.
- **Prices vary by country**, set by the country of the payment card. The Terms say so, and say what happens when a card from another country is used.
- **New plans:** Basic, Plus and Premium, with Ask Pinard allowances of 30, 160 and 450 a month. Also:
  - a fair-use limit of 60 a day;
  - top-up packs.
- **New personal data, all disclosed in the Privacy Policy:**
  - the card's country;
  - a yes or no on whether the browser agrees with the IP country;
  - sign-in countries by day;
  - pricing and checkout steps, not recorded when the browser asks not to be tracked.
- **New cookie:** `pinard_price_check`, listed in the Cookie Policy.
- **[Solicitor]** Review the clauses marked "For legal review" in the Terms, and whether `pinard_price_check` counts as strictly necessary.

## Needs a solicitor

1. **[Solicitor] All five legal pages**, especially the limitation of liability, governing law, and the Refunds page's withdrawal wording.
2. **[Solicitor] Content licences** ([SOURCES.md](SOURCES.md), with the owner's position). The narrow question: whether storing the full texts of TOG (466 articles, owner's membership access) and RCOG material (329 documents) and sending them to AI services for a paid product is covered by membership access or the text-and-data-mining rules. Citing and paraphrasing them is not the concern.
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
  - other countries' taxes on digital services sold by foreign businesses. Several have **no threshold**, so registration is due from the first sale:
    - **India** (GST on online services, 18%): many MRCOG candidates are there;
    - **Saudi Arabia** (VAT, 15%);
    - others to check: UAE, Oman, Bahrain, Egypt, Pakistan, Nigeria, Malaysia, Singapore, Australia, New Zealand, Norway, Switzerland.
    Stripe Tax shows when a threshold is reached (Tax > Registrations, "Monitoring"), but registering in each country is yours to do.
- **[Accountant] Sole trader registration** with Revenue, and a business name registration with the CRO if you trade as "Pinard".
- **[Accountant] Keeping records:** six years, which the privacy policy states.

## Open items (not done in this phase)

- **No automatic deletion of accounts unused for a long time.** The policy says data is kept "while your account is open". A rule such as "deleted after three years without signing in, with a warning email first" is a decision for you.
- **Processing locations stay as they are** (owner's decision, 9 October 2026): Claude through the "global" AWS route, Vercel in its default US region. The privacy policy already describes both.
- **Accessibility:** some question figures (charts, traces) lack full text descriptions, and the statement says so.
- **The withdrawal refund is tested in Stripe test mode** with a throwaway test subscription: it refunded £16.99 in full, ended the plan at once, a second press did not refund twice, and the purchase was no longer offered afterwards. What has not been seen is the Account page itself while signed in, because I cannot sign in as you.
- **The UK subscription rules from January 2027** need renewal reminder emails and possibly changes to annual renewals. Plan this in the autumn.
- **Store apps:** see [APP-STORES.md](APP-STORES.md).

## Pre-launch checklist: things only you can do

**Before taking any payment**
- [ ] Fill in **Admin > Legal**: legal name, postal address and contact email. Consumer law requires them.
- [ ] Make sure the contact email (default **support@pinardapp.com**) receives mail and is read. Withdrawal requests and data requests have legal deadlines.
- [ ] Solicitor review: the items above.
- [ ] Accountant: VAT and registrations, above.
- [ ] Content licences: act on the solicitor's answer to item 2.

**Settings (each needs your hands, or your approval for me to do it)**
- [x] Run `supabase/phase44-retention.sql` (done 9 October 2026).
- [x] Voyage AI training opt-out (done 9 October 2026).
- [ ] **Stripe live mode.** I can only reach the test account, so these are yours. In the Stripe Dashboard, make sure the toggle at the top says **Live**, not **Test mode**, then:
  1. **Cancelling:** Settings (cog icon) > Billing > **Customer portal**. Under "Subscriptions", **Cancel subscriptions** must be on, with "Cancel at end of billing period". Save.
  2. **Renewal reminders:** Settings > Billing > **Subscriptions and emails**. Under "Manage communication with customers", turn on **Send emails about upcoming renewals**. Save.
- [ ] **VAT (live mode),** once the accountant has said where you must register:
  1. Stripe Dashboard > **Tax** > Set up. Head office: your Irish address. Default tax behaviour: **Inclusive**. Default product tax code: **Electronically supplied services**.
  2. Tax > **Registrations** > Add registration, for each country where you are registered: the UK first, with the HMRC VAT number; Ireland (One-Stop Shop) once due.
  3. Stripe Dashboard > Product catalogue > the Ask Pinard top-up price: set it to **Inclusive** if it says "unspecified" (the plan prices already are).
  4. In Vercel, add `STRIPE_TAX_ENABLED` = `true` for Production, and redeploy. From then on checkout asks for a billing address and charges VAT inside the price.
  Stripe Tax charges 0.5% of each payment where tax is calculated.
- [ ] **GitHub:** if reminder emails were ever switched on, open Actions > Daily reminders. Delete the logs of runs before this change, which may show candidate IDs.

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
