# Pinard pricing model

Phase 1 of the four-tier rebuild: cost and pricing. Read-only: no app code, Stripe setting or data was changed. Measured 9 and 10 October 2026. All money is in euro, **net of tax**, unless it says otherwise.

Version 2's figures come from [docs/pricing/pricing-model.py](pricing/pricing-model.py), run against the token counts measured after fix A, in [docs/pricing/askcost-2026-10-10-after-fixA.json](pricing/askcost-2026-10-10-after-fixA.json). Change an input and re-run it to see the effect. Version 1's measurements are in `askcost-2026-10-09-before-fixA.json`.

## Version 3: priced for the market (10 October 2026)

The owner's instruction: if the prices look low, raise them to what the market expects, balancing strong sales against profit. They were low. Version 2 was set up from the cost floor, not down from what candidates already pay, and it left Pinard among the cheapest Part 2 resources despite offering more than the dearest.

### What candidates pay elsewhere (checked 10 October 2026)

| Product | What it is | Price | Per month, about |
|---|---|---|---|
| [RCOG Part 2 revision collection](https://elearning.rcog.org.uk/product?catalog=ct_exampreppt2bundle) | The College's own: about 270 SBAs, 120 EMQ scenarios, TOG archive | £324 for 6 months | €63 |
| [Pipador](https://pipador.co.uk/courses/mrcog-part-2-revision-course-lectures-question-bank/) | 1,100+ SBA/EMQ questions; lectures on the dearer plan | £150 for 3 months (bank only), £199 for 6 months with lectures | €59 |
| [StudyMEDIC](https://study-mrcog.com/product-category/courses/mrcog-part-2/) | Taught courses | £339 (3 months) to £799 | €130 and up |
| [CrashMRCOG](https://crashmrcog.com/course/part-2-mrcog/) | Recall-style bank | £100 a year | €10 |
| [PassMRCOG](https://www.passmrcog.com/mrcog2/index.php), [eMRCOG](https://emrcog.com/course/?categoryid=5) | Older or smaller banks | £35 to £75 for 4 to 6 months | €8 to €15 |

The cheap end sells recalls and older questions. Pinard competes with the RCOG and Pipador: questions from current guidance with every explanation cited, an adaptive plan, timed mocks marked as the paper is, and Ask Pinard. Neither of them has the last three. Version 2's Plus, at €69 for three months (€23 a month), was about a third of their price.

### Version 3 prices (net of tax)

| Region | Basic, month / 3 months | Plus (recommended) | Premium |
|---|---|---|---|
| Standard | €29 / €69 | €49 / €119 | €79 / €189 |
| Mid | €24 / €59 | €39 / €95 | €65 / €155 |
| Lower | €17 / €42 | €29 / €72 | €52 / €129 |

Top-ups: 50 questions €8, 150 questions €20. Allowances, the fair-use limit and the founding offer (30% off the first period, Basic and Plus) are unchanged.

### Why these figures

- **Plus at €119 for three months** (about £102) sits clearly below the RCOG (about €190 for the same three months) and Pipador's bank alone (about €176), with more in it. Below the established names is right for a new brand with no reviews yet; a long way below them reads as a weaker product.
- **Three months saves 17% to 21%**, enough to make it the plan most people choose, which suits a ten-to-fourteen-week revision run.
- **The tiers pull upwards.** Basic to Plus is €50 for five times the Ask Pinard questions; Plus to Premium is €70 for nearly three times as many again. Plus stays the obvious middle.
- **The founding offer gets sharper.** 30% off Plus is €83.30 for the first three months, a strong reason to buy at launch, and every founding price still clears the floor.
- **Revenue.** At version 2's prices a Plus buyer paid €69; now €119. Conversion would have to fall by more than 42% before revenue dropped, and pricing below the RCOG and Pipador should not cost anywhere near that.
- **Regions** keep the same shape: Mid about 80% of Standard, Lower about 60% (Premium held higher in Lower by its AI cost). India and Pakistan's MRCOG candidates already pay StudyMEDIC's sterling prices.

### Every price against the floor (cost at full use plus 30%)

All 18 plan prices, both top-ups and every founding price pass at the worst-case AI cost. The lowest margin at full use is Lower Premium three-monthly at 49%. The full table is the output of [pricing/pricing-model.py](pricing/pricing-model.py).

With the app stores' 15% in place of Stripe's fees (docs/MOBILE-PLAN.md), every price now passes as well. Version 2's Lower Premium three-monthly at €95 did not.

### Review

Look again after the first 100 paying customers. If conversion from the pricing page holds above about 3% at these prices, test Plus at €129.

## Version 2.1: selling worldwide, tax, and the founding offer (10 October 2026)

*Version 3 above replaces the prices in this section and those below; the reasoning on tax, regions and the founding offer still stands.*

**Approved by the owner on 10 October 2026:** the version 2 prices and allowances, and keeping the founding offer if it stays profitable. Two changes follow below: Lower Premium three-month rises from €89 to €95, and the founding offer applies to Basic and Plus only.

### The question

You are registered for VAT in Ireland and want Pinard sold worldwide, paying tax only in Ireland.

### What the law allows

- **Ireland and the rest of the EU: one Irish return covers it.** While your cross-border EU sales to consumers stay under €10,000 a year, Irish VAT applies to every EU sale. Above that, each country's VAT applies, but it is declared and paid in Ireland through the EU One-Stop Shop. So for the EU, "pay in Ireland" is already the legal position.
- **Elsewhere, consumer tax belongs to the customer's country.** Ireland cannot collect it for them.
  - Some countries let small foreign sellers skip registration below a threshold, for example Australia, New Zealand, Norway, Switzerland, Singapore, South Africa, Malaysia and the US states. Charging no tax there is legal until the threshold is reached.
  - Others require registration from the very first sale to a consumer: **the UK** (Pinard's core market), **India**, **Saudi Arabia** and several more.
  - **Not charging tax there, and selling at the full price, is not a legal path.** The tax is legally due whether or not it is charged, and an unregistered seller still owes it.

### The legal path: a merchant of record

A merchant of record sells to each customer in its own name. It charges, collects and pays the tax in every country, and handles refunds, card disputes and payment questions. You sell Pinard to it, and only your Irish tax affairs are yours.

**Recommended: Stripe Managed Payments**, Stripe's own merchant of record. Checked against Stripe's documentation on 10 October 2026:
- **Eligibility:** Ireland is a supported business location, and online courses and training are a supported product, provided they are fully automated. Pinard is: your review happens before content is released, not for each customer.
- **Coverage:** Stripe handles sales tax, VAT and GST in more than 80 countries, and customers can buy from more than 195.
- **Cost:** 3.5% per payment on top of normal Stripe fees. It replaces the 0.5% Stripe Tax fee.
- **It stays on Stripe:** the same account, products, prices, webhooks and customer portal, so the build is close to what was planned.

**The fallback, if Stripe's eligibility review says no: Paddle**, at 5% + 50 cents per payment, covering payments and tax worldwide. That would mean moving the payment code off Stripe.

### What changes because of it

- **Customers see the sale as made by Link,** Stripe's consumer brand ("Sold through Link"), on the checkout page, receipts and statements. Link also answers payment questions and may refund within 60 days in some cases. Your 14-day refund promise and the withdrawal button still work: refunds can be made from Pinard.
- **Checkout is Stripe's own page** (hosted or embedded); custom payment forms are not supported. So the "card first, then price" flow from section 7 cannot run before payment. Instead:
  - the server picks the region before checkout, from the IP country and the other signals, with Standard whenever in doubt;
  - the customer sees and pays that price;
  - straight after payment, the webhook reads the card's issuing country. If the card belongs to a dearer region, the payment is refunded in full, the plan cancelled, and the customer invited to subscribe at their own price.

  No one is ever charged a price they did not see. The rare mismatch is refunded instead of being stopped before payment.
- **Local currency** comes from Stripe's Adaptive Pricing, which converts your euro price at checkout. There is no need for a separate price per currency.
- **Tax is added on top of your net price,** as you asked. Stripe calculates and pays it; nothing in Pinard holds a tax rate. Where no tax is due, the customer pays the net price.
- **Your Irish tax:** you pay income tax on what Stripe pays you. Whether your sale to Stripe carries Irish VAT depends on which Stripe company is the buyer. One question for your accountant.
- **The legal pages change:** the Terms, Refunds and Privacy Policy must name Link as the seller and say how refunds and payment support work. Marked for the solicitor.
- **Stripe test mode:** turning on Managed Payments is a Stripe account setting. I need your go-ahead to switch it on in **test mode**; live mode stays untouched and yours to switch on.

### Prices (net of tax), with Lower Premium three-month at €95

| Region | Basic: monthly / three months | Plus: monthly / three months | Premium: monthly / three months |
|---|---|---|---|
| Standard | €19 / €45 | €29 / €69 | €45 / €105 |
| Mid | €16 / €38 | €26 / €62 | €42 / €98 |
| Lower | €12 / €29 | €22 / €53 | €38 / **€95** |

### Margins with the merchant-of-record fee

The fees below include the 3.5% merchant-of-record fee. The founding offer is shown in the next table.

| Region | Tier | Period | Net price | Stripe fees (worst / EEA card) | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €19 | €2.44 / €1.58 | €1.40 / **€15.17** (80%) | €0.70 / **€15.86** (83%) | €0.35 / **€16.21** (85%) | €5.23 | yes |
| Standard | Basic | 3-month | €45 | €5.43 / €3.40 | €4.20 / **€35.38** (79%) | €2.10 / **€37.47** (83%) | €1.05 / **€38.52** (86%) | €13.26 | yes |
| Standard | Plus | monthly | €29 | €3.59 / €2.28 | €6.25 / **€19.17** (66%) | €3.12 / **€22.29** (77%) | €1.56 / **€23.85** (82%) | €14.11 | yes |
| Standard | Plus | 3-month | €69 | €8.19 / €5.09 | €18.74 / **€42.07** (61%) | €9.37 / **€51.44** (75%) | €4.69 / **€56.13** (81%) | €38.99 | yes |
| Standard | Premium | monthly | €45 | €5.43 / €3.40 | €17.06 / **€22.51** (50%) | €8.53 / **€31.04** (69%) | €4.27 / **€35.31** (78%) | €32.97 | yes |
| Standard | Premium | 3-month | €105 | €12.33 / €7.61 | €51.18 / **€41.49** (40%) | €25.59 / **€67.08** (64%) | €12.80 / **€79.88** (76%) | €93.77 | yes |
| Mid | Basic | monthly | €16 | €1.97 / €1.30 | €1.40 / **€12.63** (79%) | €0.70 / **€13.33** (83%) | €0.35 / **€13.68** (85%) | €4.63 | yes |
| Mid | Basic | 3-month | €38 | €4.34 / €2.74 | €4.20 / **€29.46** (78%) | €2.10 / **€31.56** (83%) | €1.05 / **€32.61** (86%) | €11.84 | yes |
| Mid | Plus | monthly | €26 | €3.05 / €1.95 | €6.25 / **€16.71** (64%) | €3.12 / **€19.83** (76%) | €1.56 / **€21.39** (82%) | €13.41 | yes |
| Mid | Plus | 3-month | €62 | €6.92 / €4.31 | €18.74 / **€36.34** (59%) | €9.37 / **€45.71** (74%) | €4.69 / **€50.40** (81%) | €37.34 | yes |
| Mid | Premium | monthly | €42 | €4.77 / €3.00 | €17.06 / **€20.17** (48%) | €8.53 / **€28.70** (68%) | €4.27 / **€32.97** (78%) | €32.11 | yes |
| Mid | Premium | 3-month | €98 | €10.79 / €6.67 | €51.18 / **€36.03** (37%) | €25.59 / **€61.62** (63%) | €12.80 / **€74.42** (76%) | €91.77 | yes |
| Lower | Basic | monthly | €12 | €1.57 / €1.06 | €1.40 / **€9.03** (75%) | €0.70 / **€9.73** (81%) | €0.35 / **€10.08** (84%) | €4.11 | yes |
| Lower | Basic | 3-month | €29 | €3.45 / €2.20 | €4.20 / **€21.35** (74%) | €2.10 / **€23.45** (81%) | €1.05 / **€24.50** (84%) | €10.69 | yes |
| Lower | Plus | monthly | €22 | €2.68 / €1.73 | €6.25 / **€13.08** (59%) | €3.12 / **€16.20** (74%) | €1.56 / **€17.76** (81%) | €12.93 | yes |
| Lower | Plus | 3-month | €53 | €6.10 / €3.81 | €18.74 / **€28.16** (53%) | €9.37 / **€37.53** (71%) | €4.69 / **€42.22** (80%) | €36.28 | yes |
| Lower | Premium | monthly | €38 | €4.44 / €2.81 | €17.06 / **€16.50** (43%) | €8.53 / **€25.03** (66%) | €4.27 / **€29.29** (77%) | €31.69 | yes |
| Lower | Premium | 3-month | €95 | €10.73 / €6.64 | €51.18 / **€33.08** (35%) | €25.59 / **€58.68** (62%) | €12.80 / **€71.47** (75%) | €91.69 | yes |

- Every price passes the floor at the worst-case cost; none loses money at full use.

**Top-up packs:**

| Pack | Price (net) | AI cost, worst case | Stripe fees (worst) | Margin | Floor |
|---|---|---|---|---|---|
| 50 questions | €5 | €2.18 | €0.83 | €1.99 (40%) | €3.91 (passes) |
| 150 questions | €12 | €6.55 | €1.63 | €3.82 (32%) | €10.64 (passes) |

### The founding offer: kept for Basic and Plus

30% off the first billing period stays profitable and passes the floor on Basic and Plus in every region. **Premium is left out:**
- 30% off Premium falls below the floor in several regions;
- Lower Premium three-month could lose money if the allowance were used in full.

| Region | Tier | Period | Offer price | Margin at full use (mix / worst case) | Passes floor |
|---|---|---|---|---|---|
| Standard | Basic | monthly | €13.30 | €10.12 / €9.93 | yes |
| Standard | Basic | 3-month | €31.50 | €23.43 / €22.85 | yes |
| Standard | Plus | monthly | €20.30 | €11.47 / €10.45 | yes |
| Standard | Plus | 3-month | €48.30 | €23.75 / €20.69 | yes |
| Mid | Basic | monthly | €11.20 | €8.35 / €8.15 | yes |
| Mid | Basic | 3-month | €26.60 | €19.29 / €18.72 | yes |
| Mid | Plus | monthly | €18.20 | €9.75 / €8.72 | yes |
| Mid | Plus | 3-month | €43.40 | €19.74 / €16.68 | yes |
| Lower | Basic | monthly | €8.40 | €5.82 / €5.63 | yes |
| Lower | Basic | 3-month | €20.30 | €13.61 / €13.04 | yes |
| Lower | Plus | monthly | €15.40 | €7.20 / €6.18 | yes |
| Lower | Plus | 3-month | €37.10 | €14.01 / €10.95 | yes |

## Decision, version 2 (10 October 2026)

This section replaces the prices in sections 5 and 6. Sections 1 to 4 and 7 to 12 still apply, except where noted.

### Fix A is done and measured

Ask Pinard now returns its answer through a forced tool call with a fixed shape. The model can no longer reply in a format the app rejects.

| | Before fix A | After fix A |
|---|---|---|
| Claude calls per question | 1.67 | 1.07 |
| Cost per question, typical mix | €0.056 | **€0.037** |
| Cost per question, open questions only | €0.073 | €0.044 |

Re-measured on 29 questions; one was answered only after its first attempt was rejected. The remaining retries are the content checks doing their job: in one, the answer quoted "12+0 weeks", which was not in its cited passages, and was sent back. Commit `9463e39`.

### The approach: monthly allowances, pooled over the billing period, with top-ups

Three ways were considered.

- **Daily allowances (rejected).** Revision comes in bursts: weekends, study leave, the last six weeks. A daily cap blocks the day a candidate needs Ask Pinard most and wastes the days they don't. Its price must also assume every day is used, which is what pushed Plus to €109 in version 1.
- **Pay per question with credits only (rejected as the main model).** Every question would feel like spending money, so candidates would ask less, and the feature that most sets Pinard apart would be used least. It also adds a purchase before the first use.
- **"Unlimited" (rejected).** The cost has no ceiling, and "fair use" invites argument. A stated number is more honest.

**Chosen:**
1. **A monthly Ask Pinard allowance per tier, pooled over the billing period.** The three-month plan gives three months' worth at once, to use whenever the candidate needs it. That is a real reason to choose the plan most candidates need anyway.
2. **Top-up packs** when the allowance runs out, so running out is a small purchase and not a wall. Top-ups carry over while subscribed. The existing consent box for top-ups stays.
3. **A fair-use limit of 60 questions a day on every tier**, stated in the terms. It stops scripted or shared use draining a pool in a day. No genuine candidate reaches it.

With Ask Pinard bounded per period, its cost is small. That lets the price follow the market and still keep a high margin at full use.

### Tiers

| | Free | Basic | Plus (Recommended) | Premium |
|---|---|---|---|---|
| Ask Pinard, monthly plan | locked | 30 a month | 160 a month | 450 a month |
| Ask Pinard, three-month plan | locked | 90 over the three months | 480 | 1,350 |
| Everything else in the app | 15 sample questions and the diagnostic | yes | yes | yes |

### Prices (net of tax; Stripe adds tax on top for the buyer's country)

| Region | Basic: monthly / three months | Plus: monthly / three months | Premium: monthly / three months |
|---|---|---|---|
| Standard | €19 / €45 (€15.00 a month, save 21%) | €29 / €69 (€23.00, save 21%) | €45 / €105 (€35.00, save 22%) |
| Mid | €16 / €38 (€12.67, save 21%) | €26 / €62 (€20.67, save 21%) | €42 / €98 (€32.67, save 22%) |
| Lower | €12 / €29 (€9.67, save 19%) | €22 / €53 (€17.67, save 20%) | €38 / €89, raised to €95 in version 2.1 (€31.67, save 17%) |

**Top-up packs** (any paid tier, same price everywhere): **50 questions for €5** and **150 questions for €12**. They replace the old 100 for £4.99, which lost money.

**Against the market:**

| Provider | Price |
|---|---|
| PassMRCOG | £35 for 4 months |
| eMRCOG | £75 for 6 months |
| Crash MRCOG | £100 a year |
| Pipador | £199 for 6 months |
| RCOG's own collection | £324 for 6 months |

Standard Basic for three months is €45 net (about €55 with Irish VAT, roughly £47). It sits mid-market and beats the big courses, and it comes with a study plan, mock papers and an AI tutor that the cheap banks do not have. Plus at €69 for three months stays under every six-month course.

**Why lower than the €29 Basic you proposed.** Once Ask Pinard is bounded, a subscriber costs about €1 to €6 a month to serve. More subscribers at €19 earn more than fewer at €29, and €29 a month is above most of the market. Margins stay at 82 to 89% for Basic and 54 to 86% for the other tiers at the usage levels shown. If you would rather keep €29, the model passes with it too: change one line in `docs/pricing/pricing-model.py`.

### Rules check

The add-on is how much each tier costs above Basic, against the full-use AI cost of its allowance:

| Tier | Allowance a month | Full-use AI cost a month (mix) | Add-on over Basic (Standard) | Markup |
|---|---|---|---|---|
| Plus | 160 | €5.97 | €10 | 68% |
| Premium | 450 | €16.78 | €26 | 55% |

- **Plus:** €10 over Basic, a markup of 68%, inside your 50 to 70%.
- **Premium:** €26 over Basic, a markup of 55%, against your 50%.
- **Floor:** every price passes the cost-plus-30% floor, worked out at the worst-case cost (every question an open one) and the dearest common card.

### Margins at full, half and quarter use

| Region | Tier | Period | Net price | Stripe fees (worst / EEA card) | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €19 | €1.73 / €0.88 | €1.40 / **€15.87** (84%) | €0.70 / **€16.57** (87%) | €0.35 / **€16.92** (89%) | €4.32 | yes |
| Standard | Basic | 3-month | €45 | €3.76 / €1.74 | €4.20 / **€37.04** (82%) | €2.10 / **€39.14** (87%) | €1.05 / **€40.19** (89%) | €11.10 | yes |
| Standard | Plus | monthly | €29 | €2.52 / €1.21 | €6.25 / **€20.24** (70%) | €3.12 / **€23.36** (81%) | €1.56 / **€24.92** (86%) | €12.72 | yes |
| Standard | Plus | 3-month | €69 | €5.64 / €2.54 | €18.74 / **€44.62** (65%) | €9.37 / **€53.99** (78%) | €4.69 / **€58.68** (85%) | €35.68 | yes |
| Standard | Premium | monthly | €45 | €3.76 / €1.74 | €17.06 / **€24.17** (54%) | €8.53 / **€32.70** (73%) | €4.27 / **€36.97** (82%) | €30.81 | yes |
| Standard | Premium | 3-month | €105 | €8.45 / €3.74 | €51.18 / **€45.36** (43%) | €25.59 / **€70.96** (68%) | €12.80 / **€83.75** (80%) | €88.73 | yes |
| Mid | Basic | monthly | €16 | €1.42 / €0.75 | €1.40 / **€13.18** (82%) | €0.70 / **€13.88** (87%) | €0.35 / **€14.23** (89%) | €3.91 | yes |
| Mid | Basic | 3-month | €38 | €3.02 / €1.43 | €4.20 / **€30.78** (81%) | €2.10 / **€32.88** (87%) | €1.05 / **€33.93** (89%) | €10.14 | yes |
| Mid | Plus | monthly | €26 | €2.15 / €1.06 | €6.25 / **€17.60** (68%) | €3.12 / **€20.73** (80%) | €1.56 / **€22.29** (86%) | €12.24 | yes |
| Mid | Plus | 3-month | €62 | €4.78 / €2.18 | €18.74 / **€38.48** (62%) | €9.37 / **€47.85** (77%) | €4.69 / **€52.54** (85%) | €34.56 | yes |
| Mid | Premium | monthly | €42 | €3.32 / €1.55 | €17.06 / **€21.62** (51%) | €8.53 / **€30.15** (72%) | €4.27 / **€34.42** (82%) | €30.23 | yes |
| Mid | Premium | 3-month | €98 | €7.41 / €3.29 | €51.18 / **€39.41** (40%) | €25.59 / **€65.00** (66%) | €12.80 / **€77.80** (79%) | €87.37 | yes |
| Lower | Basic | monthly | €12 | €1.15 / €0.63 | €1.40 / **€9.45** (79%) | €0.70 / **€10.15** (85%) | €0.35 / **€10.50** (88%) | €3.56 | yes |
| Lower | Basic | 3-month | €29 | €2.42 / €1.17 | €4.20 / **€22.38** (77%) | €2.10 / **€24.48** (84%) | €1.05 / **€25.53** (88%) | €9.36 | yes |
| Lower | Plus | monthly | €22 | €1.90 / €0.95 | €6.25 / **€13.85** (63%) | €3.12 / **€16.98** (77%) | €1.56 / **€18.54** (84%) | €11.92 | yes |
| Lower | Plus | 3-month | €53 | €4.22 / €1.94 | €18.74 / **€30.04** (57%) | €9.37 / **€39.41** (74%) | €4.69 / **€44.09** (83%) | €33.84 | yes |
| Lower | Premium | monthly | €38 | €3.10 / €1.46 | €17.06 / **€17.84** (47%) | €8.53 / **€26.37** (69%) | €4.27 / **€30.64** (81%) | €29.94 | yes |
| Lower | Premium | 3-month | €89 | €6.92 / €3.09 | €51.18 / **€30.90** (35%) | €25.59 / **€56.49** (63%) | €12.80 / **€69.29** (78%) | €86.74 | yes |

- Every price passes the floor at the worst-case cost; none loses money at full use.

**Top-up packs:**

| Pack | Price (net) | AI cost, worst case | Stripe fees (worst) | Margin | Floor |
|---|---|---|---|---|---|
| 50 questions | €5 | €2.18 | €0.64 | €2.18 (44%) | €3.67 (passes) |
| 150 questions | €12 | €6.55 | €1.19 | €4.26 (36%) | €10.06 (passes) |

### What changes from version 1

- **Fixes B to D are no longer needed for profit.** Keep C (caching) for when traffic is steady. Keep D (Haiku) only after a side-by-side quality check.
- **The founding-member offer now passes the floor.** 30% off Lower Basic monthly is €8.40, against a floor of €3.56. It can stay if you want it.
- **Irish VAT on AWS.** If AWS charges 23% VAT on Bedrock, every price still makes money. Premium three-month in each region then falls just below the 30% floor; registering for Irish VAT fixes that.
- **Phase 2 changes:**
  - the Ask Pinard counter is per billing period, with the 60-a-day fair-use limit;
  - the meter reads "12 of 160 used this month" (or "this plan period" on three months);
  - the limit message offers a top-up and, where it saves money, an upgrade.

## Version 1 summary (9 October, superseded where version 2 differs)

1. **One Ask Pinard question costs €0.056 today.** That is more than it should, because half the answers to open questions are thrown away and asked again: the model replies in the wrong format ("reply was not JSON") and the whole call is paid for twice. **Fixing that alone (fix A) brings it to €0.032**, a 42% cut, with no change to answer quality. More cuts take it to €0.016.
2. **Questions come from a reviewed bank, not generated per user.** Apart from Ask Pinard, a user's AI cost is under €0.01 a day: the plan summary and the reminder email.
3. **Basic at €15 is not profitable for a heavy user at today's cost.** Ten questions a day for a month costs €17.31 in AI alone. After fix A it is €10.12, which €15 just covers.
4. **Your proposed regional Basic prices (29/69, 24/57, 19/45) all pass the cost-plus-30% rule after fix A.** At today's cost, Basic falls below the floor in every region on at least one billing period, and Lower three-month loses money at full use.
5. **Plus and Premium are expensive under the add-on rule**, because the rule prices in the full daily allowance used every day. After fix A, Plus comes to about €109 a month and Premium €179 in Standard. They pass the floor, but few candidates will pay those prices. Section 6 offers two ways to bring them down: smaller allowances, or the further cost cuts.
6. **Recommendation:** ship fix A first, in Phase 2 and before paid launch, and re-measure. Then use the price set in section 5.

**Decisions for you:**
- the price set in section 5, or the alternative in section 6;
- whether to apply fixes B to D;
- the risks in section 10, especially tax registration before selling to India and Saudi Arabia, and Vercel's Hobby plan.

## 1. The cost of one Ask Pinard question

**Method.** I ran 30 representative questions through the app's own Ask Pinard code in dev, with nothing saved to the database:
- 15 open questions in the Today box;
- 5 second questions within the same conversations;
- 10 follow-ups on real approved questions ("Ask Pinard about this question").

Token counts are the model's own figures, returned with each call. A second run of 10 questions recorded why answers were retried. There are no production logs to use instead: the live site has 3 accounts and has never stored an Ask Pinard conversation.

**Model and rates.** The model is `global.anthropic.claude-sonnet-4-6` through Amazon Bedrock (eu-west-1). AWS's official price list for eu-west-1 (published 8 October 2026) gives:
- Global route: **$3.00 per million input tokens**, **$15.00 per million output tokens**, $0.30 for cached input read, and $3.75 for a cache write;
- EU-only route ("eu." prefix): $3.30 and $16.50;
- Claude Haiku 4.5, Global: $1.00 and $5.00.

**Conversion.** €1 = $1.1206, the ECB reference rate for 9 October 2026, so $1 = €0.8924.

**Search (Voyage AI).** Each question also makes one search call, of about 30 tokens. That is under €0.00001 at any Voyage rate, so it is ignored.


| Kind | Share | Claude calls | Input tokens | Output tokens | Cost |
|---|---|---|---|---|---|
| open | 50% | 2.00 | 23,018 | 810 | €0.0725 |
| second turn | 17% | 1.60 | 19,011 | 420 | €0.0565 |
| on a question | 33% | 1.20 | 10,148 | 278 | €0.0309 |

Each fix in section 3 lowers that cost as follows:

| Scenario | Cost per question | Saving |
|---|---|---|
| Today (measured) | €0.0560 | 0% |
| A: no format retries | €0.0323 | 42% |
| A+B: 8 passages, not 12 | €0.0269 | 52% |
| A+B+C: cached instructions | €0.0243 | 57% |
| A+B+C+D: Haiku for follow-ups | €0.0164 | 71% |

**Why answers are retried.** In the 10-question diagnosis, 10 open questions needed 19 calls, and **all 9 retries had one reason: "reply was not JSON".** The model wrote a valid answer but not in the strict format the app reads, so the app discarded it and asked again. That doubles the cost of an open question. Fix A (section 3) removes it.

## 2. Every other AI cost per active user per day

| What | Live per user, or shared? | Measured | Cost |
|---|---|---|---|
| Questions and explanations | **Shared bank.** Generated by you in batches, reviewed, then reused by every user. Explanations are stored with the question; answering costs no AI. | One SBA: about 17,950 input and 1,230 output tokens over 3 calls | about €0.065 per question, **once**, not per user |
| Diagnostic, sessions, mock papers, progress | No AI | n/a | €0 |
| Study plan summary | Per user, written again only when the plan changes materially | 1,474 input, 190 output | €0.0065 each time |
| Reminder email | Per user per day, if reminders are on | 337 input, 137 output | €0.0028 a day |

**Other AI per active user is at most €0.0092 a day**, about €0.28 a month, assuming the plan summary is rewritten daily (it usually is not). The model includes this on every row.

**Bank costs are fixed, not per user.** The current 2,014 questions cost about €130 to generate. A quarterly refresh of 500 is about €33, plus the AI checks the Revise skill runs.

**Is Basic at €15 profitable for a heavy user?** Ten Ask Pinard questions every day costs €17.31 a month at today's €0.056, so **no: it loses money before payment fees.** After fix A it costs €10.12. That leaves about €3 to €4 after fees, which is profitable but under the cost-plus-30% floor with an international card. Your new Standard Basic at €29 is well clear either way.

**Fixes for heavy use:**
- fix A, which is necessary;
- the daily caps the tiers already have;
- raising the site-wide AI ceiling (currently 2,000 calls a day) and making it per tier, so one heavy Premium user cannot exhaust it for everyone;
- B to D below, where the quality risk is acceptable.

## 3. Cutting the cost per question

| Fix | What changes | Saving | Risk |
|---|---|---|---|
| **A. Stop format retries** | Ask the model for its answer through a tool call with a fixed schema (Bedrock supports this), or make the reader tolerant of text around the JSON. The answer is then read the first time. | **42%** (€0.056 to €0.032) | None to quality. It removes a failure, not a check. |
| B. 8 passages instead of 12 in the Today box | Each passage is about 767 tokens; 12 make about 9,200 of an open question's roughly 11,000 tokens on the first attempt. | about 10 percentage points more (€0.027) | Some answers may miss a passage and say "not covered". Test against the 30 questions before switching. |
| C. Cache the fixed instructions | The Today box's 1,585-token instructions are cached and read back at a tenth of the price. The question box's 576 tokens are under the 1,024-token minimum. | a few points more (€0.024) | None, but it only saves while traffic is steady: the cache lasts 5 minutes. At today's traffic it saves nothing. |
| D. Haiku 4.5 for follow-ups | Second questions in a conversation, and questions about a specific card, go to the cheaper model. Open questions stay on Sonnet. | to €0.016 (71% in total) | Real risk to answer quality on clinical detail. Only after a side-by-side check of both models on the same questions. |

Not worth doing: batch pricing (half price) does not suit a live chat, and caching passages between users would rarely match.

## 4. How the prices are worked out

**Rules applied:**
- **Floor:** no price may be below the full-use cost (AI, payment fees, tax handling) plus 30%. This replaces the €15 floor from the first brief.
- **Plus** = the region's Basic price + the monthly cost of 50 Ask Pinard questions a day, marked up 50 to 70%.
- **Premium** = Basic + the monthly cost of 100 a day, marked up 50%. The add-on is the same in every region.
- **Three-monthly** is the discounted option. The discount sits in the Basic part only, because the add-on pays for the AI.

**Usage.** "Full use" means the whole daily allowance on every day of the period, which is 30.44 days a month or 91.31 days in three months.

**Payment costs** are modelled on the worst common case in every region: an international card charged in a currency that needs conversion. That is:
- 3.15% + €0.25 (Stripe Ireland);
- + 2% currency conversion;
- + 0.7% Stripe Billing;
- + 0.5% Stripe Tax.

The percentages apply to the price including tax: 23% VAT for Standard, 15% for Mid and 18% for Lower, as examples. A standard European card costs 1.5% instead of 5.15%, so European customers do better than shown.

**Tax handling** is the 0.5% Stripe Tax fee. Registration and filing costs are fixed, not per sale: see section 10.

## 5. Recommended prices

Net of tax. Tax is added on top by Stripe for the buyer's country and shown included on the page. **These assume fix A has shipped**, so check them against the re-measured cost before launch.

| Region | Tier | Monthly | Three months | Per month on three months | Saving on three months |
|---|---|---|---|---|---|
| Standard | Basic | €29 | €69 | €23.00 | 21% |
| Standard | Plus | €109 | €309 | €103.00 | 6% |
| Standard | Premium | €179 | €519 | €173.00 | 3% |
| Mid | Basic | €24 | €57 | €19.00 | 21% |
| Mid | Plus | €104 | €297 | €99.00 | 5% |
| Mid | Premium | €174 | €507 | €169.00 | 3% |
| Lower | Basic | €19 | €45 | €15.00 | 21% |
| Lower | Plus | €99 | €285 | €95.00 | 4% |
| Lower | Premium | €169 | €495 | €165.00 | 2% |

**How the add-ons are set:**
- **Plus add-on €80 a month in every region.** The full-use AI cost of 50 a day is €49.21, so €80 is a markup of 63%, inside your 50 to 70%. On three months it is €240.
- **Premium add-on €150 a month.** The full-use AI cost of 100 a day is €98.42, so €150 is a markup of 52%. On three months it is €450.
- **Basic is your proposed price in each region.** It passes the floor everywhere after fix A.

**Margins.** The tables below give each tier three ways: allowance fully used, half used and a quarter used. Each shows AI cost, Stripe fees, net revenue after fees, and margin. They also give the floor (full-use cost plus 30%) and whether the price passes it.

**Real use will be far below "full use".** Nobody asks 100 questions every day for three months. Half and quarter use show the margins you are likely to see.

#### Recommended prices, at the cost after fix A (€0.0323 a question)

| Region | Tier | Period | Net price | Stripe fees | Net revenue | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €29 | €2.52 | €26.48 | €10.12 / **€16.36** (56%) | €5.06 / **€21.42** (74%) | €2.53 / **€23.95** (83%) | €16.43 | yes |
| Standard | Basic | 3-month | €69 | €5.64 | €63.36 | €30.37 / **€32.99** (48%) | €15.18 / **€48.18** (70%) | €7.59 / **€55.77** (81%) | €46.81 | yes |
| Standard | Plus | monthly | €109 | €8.76 | €100.24 | €49.49 / **€50.75** (47%) | €24.74 / **€75.49** (69%) | €12.37 / **€87.86** (81%) | €75.73 | yes |
| Standard | Plus | 3-month | €309 | €24.38 | €284.62 | €148.46 / **€136.15** (44%) | €74.23 / **€210.38** (68%) | €37.12 / **€247.50** (80%) | €224.70 | yes |
| Standard | Premium | monthly | €179 | €14.23 | €164.77 | €98.70 / **€66.07** (37%) | €49.35 / **€115.42** (64%) | €24.67 / **€140.10** (78%) | €146.80 | yes |
| Standard | Premium | 3-month | €519 | €40.79 | €478.21 | €296.09 / **€182.13** (35%) | €148.04 / **€330.17** (64%) | €74.02 / **€404.19** (78%) | €437.94 | yes |
| Mid | Basic | monthly | €24 | €2.00 | €22.00 | €10.12 / **€11.88** (49%) | €5.06 / **€16.94** (71%) | €2.53 / **€19.47** (81%) | €15.76 | yes |
| Mid | Basic | 3-month | €57 | €4.41 | €52.59 | €30.37 / **€22.22** (39%) | €15.18 / **€37.40** (66%) | €7.59 / **€45.00** (79%) | €45.21 | yes |
| Mid | Plus | monthly | €104 | €7.84 | €96.16 | €49.49 / **€46.67** (45%) | €24.74 / **€71.41** (69%) | €12.37 / **€83.78** (81%) | €74.53 | yes |
| Mid | Plus | 3-month | €297 | €21.94 | €275.06 | €148.46 / **€126.60** (43%) | €74.23 / **€200.83** (68%) | €37.12 / **€237.95** (80%) | €221.52 | yes |
| Mid | Premium | monthly | €174 | €12.96 | €161.04 | €98.70 / **€62.35** (36%) | €49.35 / **€111.70** (64%) | €24.67 / **€136.37** (78%) | €145.15 | yes |
| Mid | Premium | 3-month | €507 | €37.27 | €469.73 | €296.09 / **€173.64** (34%) | €148.04 / **€321.68** (63%) | €74.02 / **€395.70** (78%) | €433.37 | yes |
| Lower | Basic | monthly | €19 | €1.67 | €17.33 | €10.12 / **€7.20** (38%) | €5.06 / **€12.27** (65%) | €2.53 / **€14.80** (78%) | €15.33 | yes |
| Lower | Basic | 3-month | €45 | €3.62 | €41.38 | €30.37 / **€11.01** (24%) | €15.18 / **€26.19** (58%) | €7.59 / **€33.79** (75%) | €44.19 | yes |
| Lower | Plus | monthly | €99 | €7.67 | €91.33 | €49.49 / **€41.84** (42%) | €24.74 / **€66.59** (67%) | €12.37 / **€78.96** (80%) | €74.30 | yes |
| Lower | Plus | 3-month | €285 | €21.61 | €263.39 | €148.46 / **€114.93** (40%) | €74.23 / **€189.16** (66%) | €37.12 / **€226.28** (79%) | €221.09 | yes |
| Lower | Premium | monthly | €169 | €12.91 | €156.09 | €98.70 / **€57.39** (34%) | €49.35 / **€106.74** (63%) | €24.67 / **€131.41** (78%) | €145.09 | yes |
| Lower | Premium | 3-month | €495 | €37.34 | €457.66 | €296.09 / **€161.57** (33%) | €148.04 / **€309.62** (63%) | €74.02 / **€383.64** (78%) | €433.46 | yes |

- Every price passes the floor; none loses money at full use.

#### The same prices at today's cost (€0.0560 a question)

| Region | Tier | Period | Net price | Stripe fees | Net revenue | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €29 | €2.52 | €26.48 | €17.31 / **€9.17** (32%) | €8.66 / **€17.83** (61%) | €4.33 / **€22.16** (76%) | €25.77 | yes |
| Standard | Basic | 3-month | €69 | €5.64 | €63.36 | €51.93 / **€11.43** (17%) | €25.97 / **€37.39** (54%) | €12.98 / **€50.38** (73%) | €74.84 | **no** |
| Standard | Plus | monthly | €109 | €8.76 | €100.24 | €85.43 / **€14.81** (14%) | €42.71 / **€57.52** (53%) | €21.36 / **€78.88** (72%) | €122.45 | **no** |
| Standard | Plus | 3-month | €309 | €24.38 | €284.62 | €256.29 / **€28.33** (9%) | €128.14 / **€156.47** (51%) | €64.07 / **€220.54** (71%) | €364.88 | **no** |
| Standard | Premium | monthly | €179 | €14.23 | €164.77 | €170.58 / **€-5.81** (-3%) | €85.29 / **€79.48** (44%) | €42.64 / **€122.12** (68%) | €240.25 | **no** |
| Standard | Premium | 3-month | €519 | €40.79 | €478.21 | €511.74 / **€-33.52** (-6%) | €255.87 / **€222.35** (43%) | €127.93 / **€350.28** (67%) | €718.28 | **no** |
| Mid | Basic | monthly | €24 | €2.00 | €22.00 | €17.31 / **€4.69** (20%) | €8.66 / **€13.34** (56%) | €4.33 / **€17.67** (74%) | €25.11 | **no** |
| Mid | Basic | 3-month | €57 | €4.41 | €52.59 | €51.93 / **€0.66** (1%) | €25.97 / **€26.62** (47%) | €12.98 / **€39.60** (69%) | €73.25 | **no** |
| Mid | Plus | monthly | €104 | €7.84 | €96.16 | €85.43 / **€10.73** (10%) | €42.71 / **€53.44** (51%) | €21.36 / **€74.80** (72%) | €121.26 | **no** |
| Mid | Plus | 3-month | €297 | €21.94 | €275.06 | €256.29 / **€18.77** (6%) | €128.14 / **€146.92** (49%) | €64.07 / **€210.99** (71%) | €361.70 | **no** |
| Mid | Premium | monthly | €174 | €12.96 | €161.04 | €170.58 / **€-9.54** (-5%) | €85.29 / **€75.75** (44%) | €42.64 / **€118.40** (68%) | €238.60 | **no** |
| Mid | Premium | 3-month | €507 | €37.27 | €469.73 | €511.74 / **€-42.01** (-8%) | €255.87 / **€213.86** (42%) | €127.93 / **€341.79** (67%) | €713.71 | **no** |
| Lower | Basic | monthly | €19 | €1.67 | €17.33 | €17.31 / **€0.02** (0%) | €8.66 / **€8.67** (46%) | €4.33 / **€13.00** (68%) | €24.68 | **no** |
| Lower | Basic | 3-month | €45 | €3.62 | €41.38 | €51.93 / **€-10.55** (-23%) | €25.97 / **€15.41** (34%) | €12.98 / **€28.40** (63%) | €72.22 | **no** |
| Lower | Plus | monthly | €99 | €7.67 | €91.33 | €85.43 / **€5.90** (6%) | €42.71 / **€48.62** (49%) | €21.36 / **€69.97** (71%) | €121.03 | **no** |
| Lower | Plus | 3-month | €285 | €21.61 | €263.39 | €256.29 / **€7.11** (2%) | €128.14 / **€135.25** (47%) | €64.07 / **€199.32** (70%) | €361.26 | **no** |
| Lower | Premium | monthly | €169 | €12.91 | €156.09 | €170.58 / **€-14.49** (-9%) | €85.29 / **€70.80** (42%) | €42.64 / **€113.44** (67%) | €238.54 | **no** |
| Lower | Premium | 3-month | €495 | €37.34 | €457.66 | €511.74 / **€-54.08** (-11%) | €255.87 / **€201.79** (41%) | €127.93 / **€329.73** (67%) | €713.80 | **no** |

- Standard Basic 3-month: below the floor (€69 against €74.84), still profitable at full use
- Standard Plus monthly: below the floor (€109 against €122.45), still profitable at full use
- Standard Plus 3-month: below the floor (€309 against €364.88), still profitable at full use
- Standard Premium monthly: **loses €5.81** per month at full use
- Standard Premium 3-month: **loses €33.52** per three months at full use
- Mid Basic monthly: below the floor (€24 against €25.11), still profitable at full use
- Mid Basic 3-month: below the floor (€57 against €73.25), still profitable at full use
- Mid Plus monthly: below the floor (€104 against €121.26), still profitable at full use
- Mid Plus 3-month: below the floor (€297 against €361.70), still profitable at full use
- Mid Premium monthly: **loses €9.54** per month at full use
- Mid Premium 3-month: **loses €42.01** per three months at full use
- Lower Basic monthly: below the floor (€19 against €24.68), still profitable at full use
- Lower Basic 3-month: **loses €10.55** per three months at full use
- Lower Plus monthly: below the floor (€99 against €121.03), still profitable at full use
- Lower Plus 3-month: below the floor (€285 against €361.26), still profitable at full use
- Lower Premium monthly: **loses €14.49** per month at full use
- Lower Premium 3-month: **loses €54.08** per three months at full use

#### The same prices after fix A, if AWS charges 23% Irish VAT on the AI

| Region | Tier | Period | Net price | Stripe fees | Net revenue | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €29 | €2.52 | €26.48 | €12.39 / **€14.10** (49%) | €6.19 / **€20.29** (70%) | €3.10 / **€23.39** (81%) | €19.37 | yes |
| Standard | Basic | 3-month | €69 | €5.64 | €63.36 | €37.16 / **€26.20** (38%) | €18.58 / **€44.78** (65%) | €9.29 / **€54.07** (78%) | €55.64 | yes |
| Standard | Plus | monthly | €109 | €8.76 | €100.24 | €60.81 / **€39.43** (36%) | €30.40 / **€69.83** (64%) | €15.20 / **€85.04** (78%) | €90.44 | yes |
| Standard | Plus | 3-month | €309 | €24.38 | €284.62 | €182.42 / **€102.20** (33%) | €91.21 / **€193.41** (63%) | €45.60 / **€239.01** (77%) | €268.84 | yes |
| Standard | Premium | monthly | €179 | €14.23 | €164.77 | €121.33 / **€43.44** (24%) | €60.67 / **€104.10** (58%) | €30.33 / **€134.44** (75%) | €176.23 | yes |
| Standard | Premium | 3-month | €519 | €40.79 | €478.21 | €363.99 / **€114.22** (22%) | €182.00 / **€296.22** (57%) | €91.00 / **€387.22** (75%) | €526.21 | **no** |
| Mid | Basic | monthly | €24 | €2.00 | €22.00 | €12.39 / **€9.61** (40%) | €6.19 / **€15.80** (66%) | €3.10 / **€18.90** (79%) | €18.70 | yes |
| Mid | Basic | 3-month | €57 | €4.41 | €52.59 | €37.16 / **€15.43** (27%) | €18.58 / **€34.01** (60%) | €9.29 / **€43.30** (76%) | €54.04 | yes |
| Mid | Plus | monthly | €104 | €7.84 | €96.16 | €60.81 / **€35.35** (34%) | €30.40 / **€65.75** (63%) | €15.20 / **€80.95** (78%) | €89.25 | yes |
| Mid | Plus | 3-month | €297 | €21.94 | €275.06 | €182.42 / **€92.64** (31%) | €91.21 / **€183.85** (62%) | €45.60 / **€229.46** (77%) | €265.66 | yes |
| Mid | Premium | monthly | €174 | €12.96 | €161.04 | €121.33 / **€39.71** (23%) | €60.67 / **€100.38** (58%) | €30.33 / **€130.71** (75%) | €174.57 | **no** |
| Mid | Premium | 3-month | €507 | €37.27 | €469.73 | €363.99 / **€105.73** (21%) | €182.00 / **€287.73** (57%) | €91.00 / **€378.73** (75%) | €521.65 | **no** |
| Lower | Basic | monthly | €19 | €1.67 | €17.33 | €12.39 / **€4.94** (26%) | €6.19 / **€11.13** (59%) | €3.10 / **€14.23** (75%) | €18.28 | yes |
| Lower | Basic | 3-month | €45 | €3.62 | €41.38 | €37.16 / **€4.22** (9%) | €18.58 / **€22.80** (51%) | €9.29 / **€32.09** (71%) | €53.01 | **no** |
| Lower | Plus | monthly | €99 | €7.67 | €91.33 | €60.81 / **€30.53** (31%) | €30.40 / **€60.93** (62%) | €15.20 / **€76.13** (77%) | €89.02 | yes |
| Lower | Plus | 3-month | €285 | €21.61 | €263.39 | €182.42 / **€80.98** (28%) | €91.21 / **€172.19** (60%) | €45.60 / **€217.79** (76%) | €265.23 | yes |
| Lower | Premium | monthly | €169 | €12.91 | €156.09 | €121.33 / **€34.76** (21%) | €60.67 / **€95.42** (56%) | €30.33 / **€125.75** (74%) | €174.52 | **no** |
| Lower | Premium | 3-month | €495 | €37.34 | €457.66 | €363.99 / **€93.67** (19%) | €182.00 / **€275.66** (56%) | €91.00 / **€366.66** (74%) | €521.73 | **no** |

- Standard Premium 3-month: below the floor (€519 against €526.21), still profitable at full use
- Mid Premium monthly: below the floor (€174 against €174.57), still profitable at full use
- Mid Premium 3-month: below the floor (€507 against €521.65), still profitable at full use
- Lower Basic 3-month: below the floor (€45 against €53.01), still profitable at full use
- Lower Premium monthly: below the floor (€169 against €174.52), still profitable at full use
- Lower Premium 3-month: below the floor (€495 against €521.73), still profitable at full use

**If fix A is not done**, the lowest Basic prices that pass the floor at today's cost are:
- Standard: €75 for three months;
- Mid: €26 monthly, €74 for three months;
- Lower: €25 monthly, €73 for three months.

The regional differences mostly disappear, which is another reason to ship fix A first.

## 6. Bringing Plus and Premium down

The add-on rule prices in every question of the allowance, every day. Two honest ways to lower Plus and Premium:

**(a) Cut the cost per question further (section 3).** The add-ons fall with it:

| Cost per question | Plus add-on (50 a day, ×1.5 to ×1.7) | Premium add-on (100 a day, ×1.5) |
|---|---|---|
| Today (measured), €0.0560 | €128 to €145 (cost €85.15) | €255 (cost €170.30) |
| A: no format retries, €0.0323 | €74 to €84 (cost €49.21) | €148 (cost €98.42) |
| A+B: 8 passages, not 12, €0.0269 | €61 to €69 (cost €40.87) | €123 (cost €81.75) |
| A+B+C: cached instructions, €0.0243 | €55 to €63 (cost €37.00) | €111 (cost €74.00) |
| A+B+C+D: Haiku for follow-ups, €0.0164 | €37 to €42 (cost €24.90) | €75 (cost €49.81) |

**(b) Smaller daily allowances.** For example, Plus 25 a day and Premium "unlimited" with fair use at 50 a day. On the same rules and the cost after fix A, Plus becomes about €69 and Premium €109 in Standard:

#### Alternative for discussion: Plus 25 a day, Premium 50 a day (fair use), after fix A

| Region | Tier | Period | Net price | Stripe fees | Net revenue | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |
|---|---|---|---|---|---|---|---|---|---|---|
| Standard | Basic | monthly | €29 | €2.52 | €26.48 | €10.12 / **€16.36** (56%) | €5.06 / **€21.42** (74%) | €2.53 / **€23.95** (83%) | €16.43 | yes |
| Standard | Basic | 3-month | €69 | €5.64 | €63.36 | €30.37 / **€32.99** (48%) | €15.18 / **€48.18** (70%) | €7.59 / **€55.77** (81%) | €46.81 | yes |
| Standard | Plus | monthly | €69 | €5.64 | €63.36 | €24.88 / **€38.48** (56%) | €12.44 / **€50.92** (74%) | €6.22 / **€57.14** (83%) | €39.68 | yes |
| Standard | Plus | 3-month | €189 | €15.01 | €173.99 | €74.65 / **€99.33** (53%) | €37.33 / **€136.66** (72%) | €18.66 / **€155.32** (82%) | €116.57 | yes |
| Standard | Premium | monthly | €109 | €8.76 | €100.24 | €49.49 / **€50.75** (47%) | €24.74 / **€75.49** (69%) | €12.37 / **€87.86** (81%) | €75.73 | yes |
| Standard | Premium | 3-month | €309 | €24.38 | €284.62 | €148.46 / **€136.15** (44%) | €74.23 / **€210.38** (68%) | €37.12 / **€247.50** (80%) | €224.70 | yes |
| Mid | Basic | monthly | €24 | €2.00 | €22.00 | €10.12 / **€11.88** (49%) | €5.06 / **€16.94** (71%) | €2.53 / **€19.47** (81%) | €15.76 | yes |
| Mid | Basic | 3-month | €57 | €4.41 | €52.59 | €30.37 / **€22.22** (39%) | €15.18 / **€37.40** (66%) | €7.59 / **€45.00** (79%) | €45.21 | yes |
| Mid | Plus | monthly | €64 | €4.92 | €59.08 | €24.88 / **€34.19** (53%) | €12.44 / **€46.63** (73%) | €6.22 / **€52.86** (83%) | €38.75 | yes |
| Mid | Plus | 3-month | €177 | €13.18 | €163.82 | €74.65 / **€89.17** (50%) | €37.33 / **€126.50** (71%) | €18.66 / **€145.16** (82%) | €114.18 | yes |
| Mid | Premium | monthly | €104 | €7.84 | €96.16 | €49.49 / **€46.67** (45%) | €24.74 / **€71.41** (69%) | €12.37 / **€83.78** (81%) | €74.53 | yes |
| Mid | Premium | 3-month | €297 | €21.94 | €275.06 | €148.46 / **€126.60** (43%) | €74.23 / **€200.83** (68%) | €37.12 / **€237.95** (80%) | €221.52 | yes |
| Lower | Basic | monthly | €19 | €1.67 | €17.33 | €10.12 / **€7.20** (38%) | €5.06 / **€12.27** (65%) | €2.53 / **€14.80** (78%) | €15.33 | yes |
| Lower | Basic | 3-month | €45 | €3.62 | €41.38 | €30.37 / **€11.01** (24%) | €15.18 / **€26.19** (58%) | €7.59 / **€33.79** (75%) | €44.19 | yes |
| Lower | Plus | monthly | €59 | €4.67 | €54.33 | €24.88 / **€29.44** (50%) | €12.44 / **€41.89** (71%) | €6.22 / **€48.11** (82%) | €38.42 | yes |
| Lower | Plus | 3-month | €165 | €12.61 | €152.39 | €74.65 / **€77.73** (47%) | €37.33 / **€115.06** (70%) | €18.66 / **€133.72** (81%) | €113.45 | yes |
| Lower | Premium | monthly | €99 | €7.67 | €91.33 | €49.49 / **€41.84** (42%) | €24.74 / **€66.59** (67%) | €12.37 / **€78.96** (80%) | €74.30 | yes |
| Lower | Premium | 3-month | €285 | €21.61 | €263.39 | €148.46 / **€114.93** (40%) | €74.23 / **€189.16** (66%) | €37.12 / **€226.28** (79%) | €221.09 | yes |

- Every price passes the floor; none loses money at full use.

**On the three-month saving.** For Plus and Premium it is small (2 to 6%), because only the Basic part is discounted. The toggle will show it truthfully. A bigger saving needs a discount on the add-on too, which is possible within the floor but is your call.


## 7. Regions, and how a customer's region is decided

**Regions as proposed:**
- **Standard:** the UK, the whole EU and EEA (always one region at one net price), Switzerland, the Gulf states, the USA, Canada, Australia, New Zealand, Singapore, Hong Kong, and **every country not listed, or any case of doubt**.
- **Mid:** Malaysia, South Africa, Jordan.
- **Lower:** India, Pakistan, Bangladesh, Sri Lanka, Nepal, Egypt, Nigeria, Ghana, Kenya.

Stripe accepts cards from all of these. Stripe refuses payments involving sanctioned places (Cuba, Iran, North Korea, Syria, and occupied regions of Ukraine), so those cannot buy at all.

**Display currency.** Each visitor sees their own currency where Stripe supports it, and otherwise pounds, as you asked. The Stripe account settles in euro, so every non-euro charge pays the 2% conversion fee, which the model already includes. Adding a GBP payout account in Stripe would remove it for UK customers.

**The card decides; the IP address only suggests.** Stripe Checkout, which Pinard uses today, fixes the price before the customer types a card, so it cannot price by card country. Recommended replacement: Stripe's **Payment Element** with **confirmation tokens**, on Pinard's own page:

1. **What to display first.** The server uses Vercel's IP-country header, and shows Standard if any of these hold:
   - the country is not in a cheaper region;
   - the browser's time zone or language disagrees with it (these come from the browser and can only push the price up, never down);
   - the address looks like a VPN, proxy or data centre (Vercel does not detect this; an IP-intelligence service such as IPinfo's privacy detection does, as a small paid add-on).
2. **Card, Apple Pay or Google Pay.** The customer enters one. The browser creates a confirmation token, and nothing is charged yet. The server reads the token's card details: the issuing country (for Apple Pay and Google Pay, the country of the card inside the wallet) and whether it is credit, debit or prepaid.
3. **Same region: one step.** The server creates the subscription at that region's price and confirms it with the token.
4. **Different region: confirm first.** The server shows the correct price (only that one) and asks the customer to confirm before anything is taken. The same applies when the card's region is cheaper.
5. **Safety net (webhook).** On every paid invoice, the server compares the card country on the charge with the region of the price charged. If a cheaper-region price was paid with a card from a dearer region, it:
   - refunds in full;
   - cancels;
   - emails an invitation to subscribe at the customer's own price.
6. **Renewals and card changes.** The region is re-checked before each renewal and whenever the card changes. A change applies from a later renewal, with notice by email. **Your Terms promise 30 days' notice of a price change**, so it takes effect at the first renewal at least 30 days after the notice, not necessarily the next one.

**Prepaid and virtual cards.**
- Stripe reports the card type (`credit`, `debit`, `prepaid` or `unknown`). **Recommend: prepaid and unknown pay Standard.** Prepaid cards are easy to obtain abroad, and are the obvious way to get a cheaper region's price.
- Stripe has no flag for virtual cards. They carry the issuing bank's country like any other card, so they are priced by that country.

**Abuse that remains.** Someone with a genuine Indian card who lives in the UK pays the Lower price. The card rule cannot see that, and the account-sharing flags (section 9) are the only check.

## 8. Keeping the price table private (Phase 2 design)

- Prices and Stripe price IDs live only in server configuration. The pricing page receives one price: the visitor's own.
- The checkout endpoint accepts only a tier and a billing period. It ignores any country, currency, region or price ID sent with the request, and a request carrying one is refused and logged.
- Errors never name another region, price or price ID. No page says "regional discount", and no page says or implies that everyone pays the same price.
- The pricing endpoint is rate-limited per visitor, the same way the access-code gate is.

## 9. Account sharing

- **Simultaneous sessions: keep 1.** Pinard already allows one signed-in device per account: signing in on a second signs out the first. That suits a candidate moving between phone and laptop, and it is the strongest check on sharing.
- **Flags for your review, no automatic action:**
  - accounts where most sign-ins over 30 days come from outside the region they pay for;
  - accounts that sign in from 3 or more countries within 7 days.
  Travel is legitimate, so a flag is only a prompt to look. This needs a small new table of sign-in countries, which is a schema change for your approval in Phase 2, and a line in the privacy policy.

## 10. Risks and things to decide

1. **Fix A comes first.** Before it, the proposed prices break your floor rule in most places and Premium loses money.
2. **Irish VAT on AWS.** While you are not registered for VAT in Ireland, AWS charges you 23% VAT on Bedrock, which you cannot reclaim. That raises AI costs by 23% (third table in section 5). Registering for Irish VAT, even voluntarily, removes it. A question for the accountant.
3. **Tax registration before selling in a country.** Stripe Tax only charges tax where you have told it you are registered. Several countries in the list tax digital services sold from abroad from the first sale:
   - **India** (GST);
   - **Saudi Arabia** (VAT);
   - and, to check with the accountant, Egypt, Bangladesh and Kenya among others.

   Selling there unregistered means collecting no tax that is legally due. Registration can need a local representative, a fixed cost that may exceed the revenue from a small market. **Recommendation:** open a country for sale only once registered there, or accept that risk knowingly.
4. **Indian cards and renewals.** India's rules for recurring card payments require an e-mandate, so renewals on Indian cards can fail more often. Phase 2 tests must include an Indian renewal.
5. **The founding-member offer conflicts with the floor.** 30% off the first cycle takes Lower Basic from €19 to €13.30, under its €15.33 floor. Retire the offer, or exclude cheaper regions and three-month plans.
6. **Ask Pinard top-ups** (100 questions for £4.99) lose money at today's cost and do not fit daily allowances. Remove them, honouring any unused.
7. **Vercel's Hobby plan is for non-commercial use only.** The reminder workflow notes that Pinard runs on it. A paid product needs Vercel Pro (about $20 a month) before charging.
8. **Fixed monthly costs** are not in the per-user model: Vercel Pro, your Supabase plan, Resend, Voyage, the domain, the accountant, and any tax representatives. Divide their monthly total by the margin per subscriber to see how many subscribers you need to break even.
9. **Only MRCOG Part 2 has questions** (2,014 approved; none for Part 1 or Part 3). Every card must say Part 2, or Part 1 and Part 3 buyers will feel misled.
10. **Existing subscribers.** Two subscriptions exist, and the Annual plan is being removed. Anyone on an old plan keeps it until it renews or they change, with notice.
11. **The legal pages change.** Prices become net, with tax added on top and shown included for the visitor's country. Terms, Refunds and the pricing copy were written for one inclusive price, and all need updating in Phase 2.

## 11. Free tier, and the features the cards may list

Built from the code as it is today, not from plans.

**Free, as agreed before and as you set now:**
- **15 sample questions in total**, each with full worked feedback and its sources. Today the free sampler is 3 per section, 107 in all, so Phase 2 changes the database rule (an SQL change for your approval).
- **The free diagnostic** and its results: weak areas and a partial topic map.
- **Ask Pinard shown locked.**
- No study plan or Today session.
- Limited per verified account: at public launch, sign-up needs a confirmed email address.

**Every paid tier (Basic, Plus, Premium):**
- the full MRCOG **Part 2** question bank: 2,014 SBA and EMQ questions, each with explanations and cited sources;
- the full diagnostic and a topic map against the 70% line;
- a study plan built backwards from the exam date, with a written summary;
- Today's session, and practising any section;
- your flagged questions;
- timed mock papers (50 SBA and 50 EMQ, at exam timings);
- progress and readiness;
- reminder emails.

**Ask Pinard** (cited answers from the source library, on Today and under every question):
- Basic: 10 a day;
- Plus: 50 a day;
- Premium: unlimited, fair use 100 a day.

**Not to be listed:**
- Similar values (switched off);
- mobile apps (not built);
- push notifications (none);
- Part 1 and Part 3 questions (none yet).

## 12. Terms draft additions (for legal review)

> **[For legal review]** Prices vary by country. The price you pay is set by the country that issued your payment card, and you will see that price, with any tax, before you pay. If a subscription is bought at a price for a country other than the one your card was issued in, we may refund it in full and cancel it, and invite you to subscribe at the price for your card's country. If you change your card and the new card was issued in a country with a different price, the new price applies from a renewal at least 30 days after we tell you by email. You can cancel before then.

## Sources

- AWS Price List, Amazon Bedrock foundation models, eu-west-1, published 8 October 2026: `pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/eu-west-1/index.json`.
- European Central Bank euro reference rates, 9 October 2026: `ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`.
- Stripe pricing for Ireland, fetched 9 October 2026: `stripe.com/ie/pricing`. Covers cards, currency conversion, Billing at 0.7% and Tax at 0.5%.
- Token counts: measured in dev on 9 and 10 October 2026, `docs/pricing/askcost-2026-10-09.json`.

## Phase 2: what was built (10 October 2026)

The full list is in `docs/BUILD-PHASES.md` (Phase 12b). The owner's live-mode steps are in `docs/pricing/LIVE-CHECKLIST.md`, and the screenshots are in `docs/pricing/screenshots/`. Two departures from the brief, both forced by the choice of merchant of record:

- **No card-first checkout.** Managed Payments supports only Stripe's own checkout page, so the price is decided before payment, from the IP country confirmed by the browser's time zone and language. The card's issuing country is then checked straight after payment: a cheaper region's price paid with a dearer region's card is refunded in full and cancelled, and the customer is invited to subscribe at their own price. No one is charged a price they did not see.
- **Local currency through Stripe's Adaptive Pricing.** Prices are set in euro. Managed Payments always converts them at checkout into the buyer's currency where Stripe supports it, so separate per-currency prices are not needed. The pricing page shows euro, with VAT included where Stripe can calculate it. A possible next step is to show the converted figure on the page too, using Stripe's exchange-rate quotes; that is proposed, not built.
