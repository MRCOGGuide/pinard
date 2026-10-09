import type { LegalDocKey } from "@/lib/legalShared";

/**
 * The wording each legal page shows until the owner edits it in
 * Admin > Legal pages (Phase 11). The format is the one
 * components/LegalDocument documents: ## headings, - bullets, | tables,
 * **bold**, [links](/path) and {{tokens}} filled from Admin > Legal
 * details.
 *
 * Written for a sole trader established in Ireland selling to Ireland,
 * the UK, the rest of the EU and the rest of the world. Every page is
 * marked for a solicitor's review before launch (docs/legal/README.md):
 * this is a careful first draft, not legal advice.
 */

export const LEGAL_DEFAULTS_UPDATED = "9 October 2026";

const TERMS = `These terms are the contract between you and us for your use of {{trading_name}} ("Pinard", "the Service", "we", "us"). Please read them before you subscribe. They include our [Refunds, Cancellation & Withdrawal policy](/refunds), and our [Privacy Policy](/privacy) explains how we use your data.

## 1. Who we are
{{trading_name}} is run by {{legal_name}}, a sole trader established in {{country}}. Our address is {{address}}. {{registration}}

You can contact us at {{email}}. We aim to reply within two working days.

## 2. Who can use Pinard
You must be 18 or over. Pinard is made for doctors preparing for the MRCOG examinations. You are responsible for keeping your sign-in details secure and for what happens under your account.

## 3. One account, one person
Your account is personal to you. Do not share, sell or transfer it. Only one device can be signed in at a time: signing in somewhere else signs out the first device. We may suspend an account we reasonably believe is being shared.

## 4. What Pinard is, and what it is not
Pinard is a **revision aid** for an examination. It is **not**:
- clinical, medical or diagnostic advice, and you must never rely on it to care for a patient;
- a substitute for the guidelines, textbooks and official materials it is built from;
- a promise that you will pass any examination.

Always check clinical information against the current primary source. Your clinical practice and your professional judgement remain your own responsibility.

## 5. Independence from the RCOG
Pinard is independent. It is **not affiliated with, endorsed by or connected to the Royal College of Obstetricians and Gynaecologists (RCOG)**. "MRCOG" names the RCOG's examination; we use it only to describe what Pinard helps you prepare for. Our questions are not past examination questions and are not supplied by the RCOG.

## 6. How the content is made, and the use of AI
- **Questions and explanations** are drafted with the help of an AI model (Claude, made by Anthropic) from published guidance. Each one is checked against its sources and approved by a Member of the RCOG, acting independently, before anyone sees it.
- **Ask Pinard answers** are written by AI at the moment you ask, from our source library. They are checked automatically against their sources but are **not reviewed by a person** before you see them. Ask Pinard answers are labelled as AI-written wherever they appear.
- **Study plan summaries and reminder emails** are also worded by AI from your own progress figures.

We take reasonable care, but guidance changes, and content can contain mistakes. If you think a question or answer is wrong, please report it from the question: we review every report.

## 7. Prices and payment
- Prices are shown on the [pricing page](/pricing) before you pay, in pounds sterling (GBP). **The price shown is the total you pay.** If your bank converts the payment into another currency, it may charge a conversion fee.
- Payments are taken by Stripe. We never see or store your full card details.
- You pay at the start of each period: each month, each three months or each year, depending on the plan you choose.

## 8. Automatic renewal
> **Paid plans renew automatically** at the end of each period, at the same price, until you cancel. You can cancel at any time in a couple of clicks, and you keep access until the end of the period you have paid for.

If we change the price of your plan, we will email you at least 30 days before the change affects you, and you can cancel before it does.

## 9. Cancelling, withdrawing and refunds
- **To stop your plan renewing:** go to Account and choose **Manage billing or cancel**. No fee, and no need to contact us.
- **To withdraw within 14 days and get your money back:** use **Withdraw from contract** on your Account page, or email us. Our [Refunds, Cancellation & Withdrawal policy](/refunds) explains this in full, including your legal right to withdraw.

## 10. Ask Pinard allowance and top-ups
Each answer from Ask Pinard is produced individually and costs us money, so it has a fair-use allowance:
- Every paid plan includes {{ask_monthly_limit}} Ask Pinard questions each calendar month. The allowance resets on the 1st and unused questions do not carry over.
- When it runs out you can buy a top-up of {{ask_topup_questions}} questions for {{ask_topup_price}}. This is a one-off payment, not a subscription.
- Top-up questions are used only after the monthly allowance, carry over while you stay subscribed, and end when your subscription ends. They have no cash value.
- We may change the allowance or the top-up price with reasonable notice. We may limit use that is automated or abusive.

Everything else in Pinard (questions, sessions, your plan and progress) is not metered.

## 11. Acceptable use
You must not:
- copy, scrape, publish, sell or share Pinard's questions, explanations or other content;
- share your account, or get round access, security or single-device controls;
- use automated tools to access the Service, or try to disrupt or reverse-engineer it;
- put anyone's personal data, especially patient details, into Ask Pinard or feedback;
- use the Service unlawfully or in a way that infringes anyone's rights.

## 12. Intellectual property
The software, design, questions and explanations are owned by us or our licensors. We give you a personal, non-transferable licence to use them for your own exam preparation while your account is open. The guidelines and other works we cite belong to their publishers. Our [content sources](/about) page explains where the material comes from.

## 13. If something goes wrong
If the Service is faulty or not as described, you have legal rights under the Consumer Rights Act 2022 (Ireland) and the equivalent laws where you live: we must put it right, and if we cannot, you may be entitled to a price reduction or a refund. Nothing in these terms takes those rights away.

## 14. Our liability
We do not exclude or limit our liability where it would be unlawful to do so: for example for death or personal injury caused by our negligence, for fraud, or for your statutory rights as a consumer.

Otherwise:
- we are not liable for losses that were not reasonably foreseeable when you subscribed, or for business losses (Pinard is for personal study);
- we are not liable for any loss arising from using the content in clinical practice, which section 4 tells you not to do;
- our total liability to you in any 12-month period is limited to what you paid us in that period.

## 15. Suspending or ending your account
We may suspend or end your account if you seriously or repeatedly break these terms, for example by sharing it. Where we can, we will warn you first. If we end your account without fault on your part, we will refund any period you have paid for and not used. You can close your account at any time from your Account page.

## 16. Changes to these terms
We may update these terms, for example when the law or the Service changes. We will show the new date at the top and, for an important change, email you at least 30 days before it applies to you. If you do not agree, you can cancel before the change takes effect.

## 17. Law and disputes
These terms are governed by the law of Ireland. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live, and you can bring a claim in your local courts.

Please contact us first: most problems are sorted quickly by email. You can also get free advice from the Competition and Consumer Protection Commission ([ccpc.ie](https://www.ccpc.ie)), the European Consumer Centre in your country ([eccireland.ie](https://www.eccireland.ie) in Ireland), or, in the UK, Citizens Advice.

## 18. General
If a court finds part of these terms unenforceable, the rest still applies. If we do not enforce a term straight away, we can still enforce it later. You may not transfer your rights under these terms. We may transfer ours to someone who takes over Pinard, and we will tell you if we do.`;

const PRIVACY = `This policy explains what personal data Pinard collects, why, who it is shared with, how long it is kept, and your rights. It is written to meet the EU General Data Protection Regulation (GDPR), the Irish Data Protection Act 2018 and, for users in the UK, the UK GDPR.

## 1. Who is responsible for your data
{{trading_name}} is run by {{legal_name}}, {{address}}. {{registration}} We are the "controller" of your personal data.

For any privacy question or request, email {{email}}. We are a very small business and are not required to appoint a Data Protection Officer; your request comes straight to the person responsible.

## 2. What we collect and why
| What | Why we use it | Legal basis |
|---|---|---|
| **Account:** your name, email address and password (stored only in scrambled, hashed form by our sign-in provider) | To create your account and sign you in | Contract |
| **Exam details:** exam part, exam date, time zone and preferred reminder time | To build your study plan and send reminders at the right time | Contract |
| **Revision data:** your answers, time per question, scores by section, mock results, study plans, questions you flag | To run the Service: your plan, sessions and progress | Contract |
| **Ask Pinard:** the questions you type and the answers you receive | To answer you, and to show you the conversation again on that question | Contract |
| **Payments:** your Stripe customer reference, plan, status, renewal dates and top-up purchases (never your card number) | To take payment, manage your plan, and keep tax records | Contract; legal obligation |
| **Reminder emails:** which reminders we sent and when | So you get at most one a day | Contract; legitimate interests |
| **Security:** an identifier for the one device you are signed in on, and a scrambled (hashed) form of your IP address when you enter an access code or join the waitlist | To stop account sharing, guessing of access codes and spam | Legitimate interests |
| **Feedback, question reports and pilot reviews** | To fix mistakes and improve Pinard | Legitimate interests |
| **A review comment you agree we may publish,** with the name and detail you choose | To show as a testimonial | Your consent, which you can withdraw |
| **Waitlist:** email address, exam part and date | To tell you when Pinard opens | Your consent |
| **Withdrawal and refund requests** | To process them and keep a record | Legal obligation |

We do not sell your data, and we do not use it for advertising. We do not use cookies or tools that track you around the web.

## 3. AI services and your data
Some features use AI. This is what they receive:
- **Ask Pinard:** the text of your question, and the earlier messages in the same conversation, go to Claude (an AI model made by Anthropic) through **Amazon Web Services (Bedrock)** to write the answer, and to **Voyage AI** to search our source library. Your name and email are not sent.
- **Study plan summary:** your scores by section and days to your exam go to Claude to word the summary. Nothing that identifies you is sent.
- **Reminder emails:** days to your exam, today's topics and your streak go to Claude to word the email. Your name and email are not sent.

Amazon Web Services does not use what is sent to the model to train AI models, and does not share it with Anthropic.

> **Please never type patient details, or anyone else's personal information, into Ask Pinard.** Ask about the guidance, not about a person.

Pinard does not make decisions about you by automated means that have legal or similarly significant effects. Your study plan is worked out by software from your scores, and you can change your exam and settings at any time.

## 4. Who we share it with
We share data only with the service providers below, who process it on our instructions under data processing agreements, and where the law requires it.

| Provider | What they do for us | Where the data is processed |
|---|---|---|
| Supabase Inc. | Database, sign-in and file storage | London, United Kingdom |
| Vercel Inc. | Hosts the website and runs its server code; keeps short-lived technical logs | United States, and its global network |
| Amazon Web Services EMEA SARL (Bedrock) | Runs the Claude AI model | Requests go to Ireland and may be processed in other AWS regions, including the United States |
| Voyage AI Inc. | Searches the source library for Ask Pinard | United States |
| Resend (Plus Five Five, Inc.) | Sends our emails | United States |
| Stripe Payments Europe Ltd | Takes payments and manages subscriptions | Ireland and the United States |

Stripe also acts as an independent controller for some data, for example to prevent fraud and meet its own legal duties; its [privacy policy](https://stripe.com/privacy) explains how.

If we change provider, for example to use Anthropic's own service in place of Amazon Web Services, we will update this list first.

## 5. Transfers outside the EU
Some of these providers process data outside the European Economic Area. The United Kingdom has an EU "adequacy decision", which means the EU considers its protection equivalent. For the United States, we rely on the EU-US Data Privacy Framework where the provider is certified under it, and otherwise on the European Commission's Standard Contractual Clauses (with the UK Addendum for UK users). You can ask us for more detail.

## 6. How long we keep it
| Data | How long |
|---|---|
| Account, revision data and Ask Pinard history | While your account is open. Deleted at once when you delete your account, and gone from our provider's backups within 30 days. |
| Payment and invoice records | Six years after the end of the tax year they relate to, because Irish tax law requires it |
| Reminder log | While your account is open |
| Feedback and question reports | While useful for improving the questions. If you delete your account they are kept without your name or any link to you. |
| Pilot review and any published comment | Until you ask us to remove them. A published comment comes down within 7 days of your request. |
| Waitlist entry | Until we tell you Pinard is open, and no longer than 12 months after you joined |
| Records of failed Ask Pinard answers (the question text, without your name) | Up to 12 months |
| Security records (scrambled IP address) | Up to 30 days |
| Technical logs at our hosting provider | Up to 30 days |

## 7. Your rights
You have the right to:
- **see** the data we hold about you, and get a copy of it;
- **correct** anything that is wrong;
- **delete** your data;
- **take it with you** in a machine-readable form;
- **object** to our use of it for legitimate interests, and **restrict** how we use it while a concern is looked at;
- **withdraw consent** where we rely on it, at any time.

Several of these you can do yourself on your Account page: **Download my data** gives you a copy of everything linked to your account, **Delete your account** removes it, and you can turn reminder emails off there or from the link in any reminder. For anything else, email {{email}}. We reply within one month, and may ask you to confirm your identity first.

## 8. Complaints
If you are unhappy with how we use your data, please tell us first. You also have the right to complain to a data protection authority. Our lead authority is the **Data Protection Commission** in Ireland ([dataprotection.ie](https://www.dataprotection.ie)). In the UK it is the **Information Commissioner's Office** ([ico.org.uk](https://ico.org.uk)), and elsewhere in the EU you can also complain to the authority in your own country.

## 9. Cookies
We use only the cookies needed to sign you in and keep Pinard secure. Our [Cookie Policy](/cookies) lists each one.

## 10. Security
Data is encrypted in transit and stored with providers that encrypt it at rest. Access to the database is restricted, each account can only reach its own data, and we test the Service for security problems. If a breach puts your data at risk, we will tell you and the Data Protection Commission as the law requires.

## 11. Children
Pinard is for adults (18 and over). We do not knowingly collect data about anyone under 18.

## 12. Changes to this policy
When we change this policy we update the date at the top. For an important change, we will email you before it takes effect.`;

const REFUNDS = `This page explains how to cancel, your legal right to withdraw, and our refund promise. It forms part of our [Terms & Conditions](/terms). Nothing here reduces any legal right you have as a consumer.

## Our promise: a full refund within 14 days
> If Pinard is not right for you, you can have a **full refund within 14 days** of your first subscription payment, wherever you live, with no questions asked and nothing deducted for the time you used it.

## Cancelling: stopping your plan renewing
Your plan renews automatically until you cancel. To cancel, go to **Account** and choose **Manage billing or cancel**. It takes a couple of clicks, there is no fee, and you do not need to contact us. You keep full access until the end of the period you have already paid for, and you will not be charged again.

## Withdrawing: ending the contract and getting your money back
If you are in the EU, Ireland or the UK, the law gives you **14 days** from the day you subscribe to withdraw from the contract, without giving a reason. Our promise above goes further than the law: we refund the whole first payment, not a part of it.

There are two ways to withdraw:
- **On your Account page**, use **Withdraw from contract**. It is there for 14 days after you subscribe. Confirm, and your plan ends straight away.
- **By email or post**, send a clear statement that you are withdrawing to {{email}} or to {{address}}. You may use the model form below, but you do not have to.

We will confirm by email that we have received your withdrawal, and refund you to your original payment method **within 14 days**, usually much sooner. There is no fee.

## Ask Pinard top-ups
A top-up is a one-off purchase of extra Ask Pinard questions. When you buy one, you ask us to make the questions available straight away, and you confirm that you lose the right to withdraw once you use one of them. Until you use one, you can withdraw within 14 days of buying it and we will refund it in full.

## After the 14 days
Payments for later periods (renewals) and part-used periods are not normally refundable, because you can cancel at any time before a renewal. This does not affect your rights if the Service is faulty or not as described: then we will put it right, or give you a price reduction or a refund, as the law requires.

If you are outside the EU and the UK, our 14-day promise applies to you in the same way, along with any rights the law where you live gives you.

## Discounts
Where a discount or voucher applied, the refund is the amount you actually paid.

## Model withdrawal form
Complete and return this form only if you wish to withdraw from the contract.

- To: {{legal_name}}, trading as {{trading_name}}, {{address}}, {{email}}
- I hereby give notice that I withdraw from my contract for the supply of the following service: Pinard subscription (or Ask Pinard top-up).
- Ordered on:
- Name:
- Email address used for the account:
- Date:

## Card disputes
Please contact us before asking your bank for a chargeback: we can almost always sort it out faster directly.`;

const COOKIES = `This page lists every cookie and similar technology Pinard uses. We use only what is **strictly necessary** to sign you in, keep the Service secure and remember a choice you made. We do not use analytics, advertising or tracking cookies, so we do not need to ask for your consent, and there is no cookie banner.

## Cookies we set
| Name | Purpose | How long |
|---|---|---|
| sb-…-auth-token (sometimes split into .0 and .1) | Keeps you signed in. Set by our sign-in provider, Supabase. | Until you sign out, or up to 400 days, renewed as you use Pinard |
| pinard_gate | Remembers that you entered the access code while Pinard is in its private pilot | 30 days |

## Stored in your browser
| Name | Purpose | How long |
|---|---|---|
| pinard-theme (local storage) | Remembers whether you chose the light or dark theme | Until you clear it, or change the theme |

## Payment pages
When you pay, you leave Pinard for Stripe's checkout and billing pages at checkout.stripe.com and billing.stripe.com. Stripe sets its own strictly necessary cookies there to process the payment and prevent fraud. See [Stripe's cookie policy](https://stripe.com/cookie-settings).

## Managing cookies
You can delete or block cookies in your browser settings. If you block the sign-in cookie, you will not be able to sign in.

If we ever add a cookie that is not strictly necessary, we will update this page and ask for your consent before setting it.`;

const ACCESSIBILITY = `We want everyone preparing for the MRCOG to be able to use Pinard, including people who use assistive technology. This statement covers the website at pinardapp.com.

## Our standard
We aim to meet the **Web Content Accessibility Guidelines (WCAG) 2.2 at level AA**.

## What we have done
- The site works with a keyboard alone, with a visible focus outline.
- Text and controls meet the WCAG contrast ratios, in both the light and dark themes.
- Pages use headings, landmarks and labels that screen readers can follow.
- Animation is reduced or switched off when your device asks for reduced motion.
- Text can be enlarged to 200% without loss of content.
- We test pages with automated accessibility tools (axe-core and Lighthouse) and by hand.

## Known limitations
- Some question figures, such as charts and traces, may not yet have a full text description.
- Extended matching questions have long option lists, which can take time to navigate with a screen reader.
- Pages hosted by Stripe for payment follow Stripe's own accessibility standards.

## Feedback and help
If you find something hard to use, or need content in another format, email {{email}}. We aim to reply within five working days.

## How we checked
This statement was prepared on 9 October 2026, based on our own testing.`;

export const LEGAL_DEFAULTS: Record<LegalDocKey, string> = {
  terms: TERMS,
  privacy: PRIVACY,
  refunds: REFUNDS,
  cookies: COOKIES,
  accessibility: ACCESSIBILITY,
};
