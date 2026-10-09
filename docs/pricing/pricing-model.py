"""Phase 1 pricing model. Reads docs/pricing/askcost-2026-10-09.json (measured tokens) and prints
the markdown tables used in docs/PRICING-MODEL.md. Run: python docs/pricing/pricing-model.py"""
import json, sys

sys.stdout.reconfigure(encoding="utf-8")
USD_EUR = 1 / 1.1206          # ECB reference rate, 9 October 2026
SONNET = (3.00, 15.00, 0.30)  # $/M input, output, cache read: AWS price list eu-west-1, Global, published 8 Oct 2026
HAIKU = (1.00, 5.00, 0.10)
DAYS_M, DAYS_Q = 365.25 / 12, 365.25 / 4
OTHER_AI_PER_DAY = (1474 * 3 + 190 * 15 + 337 * 3 + 137 * 15) / 1e6 * USD_EUR  # plan summary + reminder, measured

d = json.load(open("docs/pricing/askcost-2026-10-09.json"))
calls, results = d["calls"], d["results"]
kinds = {"open": "open ", "second turn": "second turn ", "on a question": "on a question "}
def eur(i, o, rate=SONNET): return (i * rate[0] + o * rate[1]) / 1e6 * USD_EUR

per = {}
for k, pre in kinds.items():
    qs = [r for r in results if r["kind"] == k]
    cs = [c for c in calls if c["label"].startswith(pre)]
    labels = sorted({c["label"] for c in cs})
    first = [next(c for c in cs if c["label"] == l) for l in labels]
    per[k] = dict(n=len(qs), calls=len(cs) / len(qs),
                  i=sum(c["input"] for c in cs) / len(qs), o=sum(c["output"] for c in cs) / len(qs),
                  i1=sum(c["input"] for c in first) / len(qs), o1=sum(c["output"] for c in first) / len(qs))
N = sum(p["n"] for p in per.values())
w = {k: p["n"] / N for k, p in per.items()}
def mix(fn): return sum(w[k] * fn(k, per[k]) for k in per)

B = 4 * 767  # four fewer passages on the Today box
def c_cost(k, p):
    i = p["i1"] - (B if k != "on a question" else 0)
    cached = 1585 if k != "on a question" else 0  # the 576-token prompt is under the 1,024 minimum
    return ((i - cached) * SONNET[0] + cached * SONNET[2] + p["o1"] * SONNET[1]) / 1e6 * USD_EUR
def d_cost(k, p):
    if k == "open": return c_cost(k, p)
    return eur(p["i1"] - (B if k == "second turn" else 0), p["o1"], HAIKU)
scen = {
    "Today (measured)": mix(lambda k, p: eur(p["i"], p["o"])),
    "A: no format retries": mix(lambda k, p: eur(p["i1"], p["o1"])),
    "A+B: 8 passages, not 12": mix(lambda k, p: eur(p["i1"] - (B if k != "on a question" else 0), p["o1"])),
    "A+B+C: cached instructions": mix(c_cost),
    "A+B+C+D: Haiku for follow-ups": mix(d_cost),
}

print("## Measured per question\n")
print("| Kind | Share | Claude calls | Input tokens | Output tokens | Cost |\n|---|---|---|---|---|---|")
for k, p in per.items():
    print(f"| {k} | {w[k]*100:.0f}% | {p['calls']:.2f} | {p['i']:,.0f} | {p['o']:,.0f} | €{eur(p['i'], p['o']):.4f} |")
print(f"\nOther AI per active day: €{OTHER_AI_PER_DAY:.4f}\n")
print("| Scenario | Cost per question | Saving |\n|---|---|---|")
base = scen["Today (measured)"]
for s, v in scen.items():
    print(f"| {s} | €{v:.4f} | {(1 - v / base) * 100:.0f}% |")

REGIONS = {  # Basic net (monthly, 3-month), VAT for the fee base, card fee incl. 2% conversion
    "Standard": (29, 69, 0.23, 0.0315 + 0.02),
    "Mid": (24, 57, 0.15, 0.0315 + 0.02),
    "Lower": (19, 45, 0.18, 0.0315 + 0.02),
}
ALLOW = {"Basic": 10, "Plus": 50, "Premium": 100}
STRIPE_FIXED, BILLING, TAX = 0.25, 0.007, 0.005
def fees(net, vat, card): return (card + BILLING + TAX) * net * (1 + vat) + STRIPE_FIXED

print("\n## Add-on by cost per question\n\n| Cost per question | Plus add-on (50 a day, ×1.5 to ×1.7) | Premium add-on (100 a day, ×1.5) |\n|---|---|---|")
for s, v in scen.items():
    c50, c100 = 50 * DAYS_M * v, 100 * DAYS_M * v
    print(f"| {s}, €{v:.4f} | €{c50*1.5:.0f} to €{c50*1.7:.0f} (cost €{c50:.2f}) | €{c100*1.5:.0f} (cost €{c100:.2f}) |")

def table(qc, label, prices, ai_vat=0.0, allow=ALLOW):
    print(f"\n### {label}\n")
    print("| Region | Tier | Period | Net price | Stripe fees | Net revenue | Full use: AI / margin | Half use: AI / margin | Quarter use: AI / margin | Floor | Passes |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    warn = []
    for r, (bm, bq, vat, card) in REGIONS.items():
        for tier in allow:
            for period, days in (("monthly", DAYS_M), ("3-month", DAYS_Q)):
                net = prices[r][tier][period]
                fee = fees(net, vat, card)
                cells = []
                for u in (1, 0.5, 0.25):
                    ai = (allow[tier] * days * qc * (1 + ai_vat) + OTHER_AI_PER_DAY * days) * u
                    cells.append((ai, net - fee - ai))
                floor = (cells[0][0] + fee) * 1.3
                if cells[0][1] < 0: warn.append(f"{r} {tier} {period}: **loses €{-cells[0][1]:.2f}** per {'month' if period=='monthly' else 'three months'} at full use")
                elif net < floor: warn.append(f"{r} {tier} {period}: below the floor (€{net:.0f} against €{floor:.2f}), still profitable at full use")
                c = " | ".join(f"€{a:.2f} / **€{m:.2f}** ({m/net*100:.0f}%)" for a, m in cells)
                print(f"| {r} | {tier} | {period} | €{net:.0f} | €{fee:.2f} | €{net-fee:.2f} | {c} | €{floor:.2f} | {'yes' if net >= floor else '**no**'} |")
    print()
    for x in warn: print(f"- {x}")
    if not warn: print("- Every price passes the floor; none loses money at full use.")

REC = {
    "Standard": {"Basic": {"monthly": 29, "3-month": 69}, "Plus": {"monthly": 109, "3-month": 309}, "Premium": {"monthly": 179, "3-month": 519}},
    "Mid":      {"Basic": {"monthly": 24, "3-month": 57}, "Plus": {"monthly": 104, "3-month": 297}, "Premium": {"monthly": 174, "3-month": 507}},
    "Lower":    {"Basic": {"monthly": 19, "3-month": 45}, "Plus": {"monthly": 99,  "3-month": 285}, "Premium": {"monthly": 169, "3-month": 495}},
}
A, T = scen["A: no format retries"], scen["Today (measured)"]
table(A, f"Recommended prices, at the cost after fix A (€{A:.4f} a question)", REC)
table(T, f"The same prices at today's cost (€{T:.4f} a question)", REC)
table(A, "The same prices after fix A, if AWS charges 23% Irish VAT on the AI", REC, ai_vat=0.23)
ALT = {"Basic": 10, "Plus": 25, "Premium": 50}
ALTP = {
    "Standard": {"Basic": {"monthly": 29, "3-month": 69}, "Plus": {"monthly": 69, "3-month": 189}, "Premium": {"monthly": 109, "3-month": 309}},
    "Mid":      {"Basic": {"monthly": 24, "3-month": 57}, "Plus": {"monthly": 64, "3-month": 177}, "Premium": {"monthly": 104, "3-month": 297}},
    "Lower":    {"Basic": {"monthly": 19, "3-month": 45}, "Plus": {"monthly": 59, "3-month": 165}, "Premium": {"monthly": 99,  "3-month": 285}},
}
table(A, "Alternative for discussion: Plus 25 a day, Premium 50 a day (fair use), after fix A", ALTP, allow=ALT)
