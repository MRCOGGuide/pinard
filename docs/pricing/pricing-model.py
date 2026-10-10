"""Pinard pricing model, version 2 (10 October 2026): monthly Ask Pinard allowances,
pooled over the billing period, plus top-up packs. Reads the token counts measured
after fix A. Run from the repo root: python docs/pricing/pricing-model.py"""
import json, sys

sys.stdout.reconfigure(encoding="utf-8")
USD_EUR = 1 / 1.1206          # ECB reference rate, 9 October 2026
SONNET = (3.00, 15.00)        # $/M input, output: AWS price list eu-west-1, Global, published 8 Oct 2026
DAYS_M, DAYS_Q = 365.25 / 12, 365.25 / 4

d = json.load(open("docs/pricing/askcost-2026-10-10-after-fixA.json"))
calls = [c for c in d["calls"] if c["label"] not in ("plan summary", "reminder email")]
n = len(d["results"])
def eur(i, o): return (i * SONNET[0] + o * SONNET[1]) / 1e6 * USD_EUR
Q_MIX = eur(sum(c["input"] for c in calls) / n, sum(c["output"] for c in calls) / n)
opens = [c for c in calls if c["label"].startswith("open ")]
n_open = sum(1 for r in d["results"] if r["kind"] == "open")
Q_WORST = eur(sum(c["input"] for c in opens) / n_open, sum(c["output"] for c in opens) / n_open)
other = [c for c in d["calls"] if c["label"] in ("plan summary", "reminder email")]
OTHER_DAY = eur(sum(c["input"] for c in other), sum(c["output"] for c in other))

print(f"Cost per question after fix A: measured mix €{Q_MIX:.4f}; open questions only (worst case) €{Q_WORST:.4f}; other AI €{OTHER_DAY:.4f} per active day\n")

ALLOW = {"Basic": 30, "Plus": 160, "Premium": 450}   # Ask Pinard per month; pooled x3 on the 3-month plan
DAILY_FAIR_USE = 60
PRICES = {  # net of tax, EUR: (monthly, 3-month)
    "Standard": {"Basic": (19, 45), "Plus": (29, 69), "Premium": (45, 105)},
    "Mid":      {"Basic": (16, 38), "Plus": (26, 62), "Premium": (42, 98)},
    "Lower":    {"Basic": (12, 29), "Plus": (22, 53), "Premium": (38, 95)},
}
VAT = {"Standard": 0.23, "Mid": 0.15, "Lower": 0.18}   # examples for the fee base only; Stripe calculates the real tax
CARD = 0.0315 + 0.02                                    # international card + currency conversion (worst common case)
EEA_CARD = 0.015
# Stripe Managed Payments (merchant of record) adds 3.5%, which includes tax
# calculation and remittance, so it replaces the 0.5% Stripe Tax fee.
BILLING, TAX, FIXED = 0.007, 0.035, 0.25
def fees(net, vat, card=CARD): return (card + BILLING + TAX) * net * (1 + vat) + FIXED

print("## Add-on check against the rules\n")
print("| Tier | Allowance a month | Full-use AI cost a month (mix) | Add-on over Basic (Standard) | Markup |\n|---|---|---|---|---|")
for t in ("Plus", "Premium"):
    cost = ALLOW[t] * Q_MIX
    add = PRICES["Standard"][t][0] - PRICES["Standard"]["Basic"][0]
    print(f"| {t} | {ALLOW[t]} | €{cost:.2f} | €{add} | {(add / cost - 1) * 100:.0f}% |")

print("\n## Margins\n")
print("Margins use the measured mix. The floor uses the worst case (every question an open one) at full use, plus 30%.\n")
print("| Region | Tier | Period | Net price | Stripe fees (worst / EEA card) | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |")
print("|---|---|---|---|---|---|---|---|---|---|")
warn = []
for r, tiers in PRICES.items():
    for t, (pm, pq) in tiers.items():
        for period, net, months, days in (("monthly", pm, 1, DAYS_M), ("3-month", pq, 3, DAYS_Q)):
            fee, fee_eea = fees(net, VAT[r]), fees(net, VAT[r], EEA_CARD)
            cells = []
            for u in (1, 0.5, 0.25):
                ai = (ALLOW[t] * months * Q_MIX + OTHER_DAY * days) * u
                cells.append((ai, net - fee - ai))
            worst_full = ALLOW[t] * months * Q_WORST + OTHER_DAY * days
            floor = (worst_full + fee) * 1.3
            if net < floor: warn.append(f"{r} {t} {period}: €{net} is below the floor €{floor:.2f}")
            c = " | ".join(f"€{a:.2f} / **€{m:.2f}** ({m/net*100:.0f}%)" for a, m in cells)
            print(f"| {r} | {t} | {period} | €{net} | €{fee:.2f} / €{fee_eea:.2f} | {c} | €{floor:.2f} | {'yes' if net >= floor else '**no**'} |")
print()
print("\n".join(f"- {w}" for w in warn) if warn else "- Every price passes the floor at the worst-case cost; none loses money at full use.")

print("\n## Top-up packs\n")
print("| Pack | Price (net) | AI cost, worst case | Stripe fees (worst) | Margin | Floor |\n|---|---|---|---|---|---|")
for q, price in ((50, 5), (150, 12)):
    ai = q * Q_WORST
    fee = fees(price, 0.23)
    floor = (ai + fee) * 1.3
    print(f"| {q} questions | €{price} | €{ai:.2f} | €{fee:.2f} | €{price - ai - fee:.2f} ({(price - ai - fee) / price * 100:.0f}%) | €{floor:.2f} {'(passes)' if price >= floor else '(**fails**)'} |")

print("\n## Founding offer (30% off the first cycle), Basic and Plus only\n")
print("| Region | Tier | Period | Offer price | Margin at full use (mix / worst case) | Passes floor |\n|---|---|---|---|---|---|")
for r, tiers in PRICES.items():
    for t, (pm, pq) in tiers.items():
        if t == "Premium":
            continue
        for period, net, months, days in (("monthly", pm, 1, DAYS_M), ("3-month", pq, 3, DAYS_Q)):
            n = net * 0.7
            fee = fees(n, VAT[r])
            worst = ALLOW[t] * months * Q_WORST + OTHER_DAY * days
            mix = ALLOW[t] * months * Q_MIX + OTHER_DAY * days
            print(f"| {r} | {t} | {period} | €{n:.2f} | €{n - fee - mix:.2f} / €{n - fee - worst:.2f} | {'yes' if n >= (worst + fee) * 1.3 else '**no**'} |")

print(f"\nDaily fair-use cap on every tier: {DAILY_FAIR_USE} questions a day, against scripted or shared use.")
