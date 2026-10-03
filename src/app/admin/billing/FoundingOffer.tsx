"use client";

import { useState, useTransition } from "react";
import { Button, Field, FIELD_CLASS, Toast } from "@/components/ui";
import type { PricingSettings } from "@/lib/offer";
import { knownCurrencies } from "@/lib/currency";
import { saveFoundingOffer } from "./actions";

/**
 * The founding offer, as a thing you set rather than a thing in the code.
 *
 * It used to be a sentence in a component: thirty percent, five hundred
 * places, and nothing counting either. Here the discount and the number
 * of places are yours to choose, the places left are counted from the
 * subscriptions table, and the banner only appears while the offer is
 * on and there are places in it.
 *
 * The resit fee sits here too because it belongs to the same argument.
 * It is the one figure on the pricing page this codebase cannot know,
 * it changes when the college changes it, and an invented exam fee on a
 * page asking for money is the worst kind of wrong. Leave it empty and
 * the line is not printed.
 */
export function FoundingOffer({ settings }: { settings: PricingSettings }) {
  const [active, setActive] = useState(settings.offer.active);
  const [percent, setPercent] = useState(String(settings.offer.percent));
  const [places, setPlaces] = useState(String(settings.offer.places));
  const [resit, setResit] = useState(
    settings.resitFeePence === null
      ? ""
      : (settings.resitFeePence / 100).toFixed(2).replace(/\.00$/, "")
  );
  /*
    One pound in each currency, as the owner's own figure. Not a live
    feed: a pricing page that depends on an exchange API is a pricing
    page that breaks when the API does, and these are an indication
    beside a GBP charge rather than a quote.
  */
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      knownCurrencies().map((c) => [c.code, String(settings.rates[c.code] ?? "")])
    )
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const pounds = resit.trim();
    startTransition(async () => {
      const rateTable: Record<string, number> = {};
      for (const [code, value] of Object.entries(rates)) {
        const n = Number(value);
        if (value.trim() !== "" && Number.isFinite(n) && n > 0) rateTable[code] = n;
      }
      const result = await saveFoundingOffer({
        active,
        percent: Number(percent),
        places: Number(places),
        resitFeePence: pounds === "" ? null : Math.round(Number(pounds) * 100),
        rates: rateTable,
      });
      if (result.error) {
        setMsg({ ok: false, text: result.error });
        return;
      }
      /*
        Which of the two things happened matters: the page's claim and
        the discount the till applies are separate stores, and the
        owner should not have to guess whether both moved.
      */
      setMsg({
        ok: result.stripe !== "failed",
        text:
          result.stripe === "updated"
            ? "Saved, and the Stripe coupon now matches."
            : result.stripe === "failed"
              ? "The page is saved, but Stripe refused the coupon: the banner would promise a discount the checkout will not apply."
              : "Saved. Stripe is not configured yet, so this is what the page says; nothing can be bought until the keys are in.",
      });
    });
  }

  const taken = settings.offer.taken;
  const left = Math.max(0, Number(places || 0) - taken);

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-semibold text-ink-strong">
        Founding offer
      </h2>
      <p className="mb-3 text-sm text-ink/60">
        The banner at the top of the pricing page. It appears only while
        this is on and there are places left, and the places left are
        counted from who has already subscribed.
      </p>

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 accent-good"
          />
          <span className="font-medium text-ink/85">Show the offer</span>
        </label>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Discount" hint="Per cent off the first cycle">
            <input
              type="number"
              min={1}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
          <Field label="Places" hint="How many subscribers it runs for">
            <input
              type="number"
              min={1}
              value={places}
              onChange={(e) => setPlaces(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
          <Field label="Resit fee" hint="£, optional. Empty hides the line.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={resit}
              onChange={(e) => setResit(e.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </Field>
        </div>

        <p className="mt-3 font-mono text-label text-ink/55">
          {taken} subscriber{taken === 1 ? "" : "s"} so far ·{" "}
          {left > 0
            ? `${left} place${left === 1 ? "" : "s"} would be left`
            : "no places left, so the banner would not show"}
        </p>

        <div className="mt-5 border-t border-line pt-4">
          <p className="font-mono text-label uppercase tracking-wide text-ink/50">
            What a pound is worth
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink/60">
            A visitor from one of these countries sees the price in their
            own money beside the pounds, labelled as a guide. Leave a box
            empty and they see pounds alone. Nothing here changes what
            anyone is charged: that is GBP until Stripe carries prices in
            other currencies.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {knownCurrencies().map((c) => (
              <label key={c.code} className="text-xs">
                <span className="font-mono text-ink/70">{c.code}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={rates[c.code] ?? ""}
                  onChange={(e) =>
                    setRates((r) => ({ ...r, [c.code]: e.target.value }))
                  }
                  className={`mt-1 ${FIELD_CLASS}`}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Saving…" : "Save"}
          </Button>
          {msg && <Toast tone={msg.ok ? "good" : "bad"}>{msg.text}</Toast>}
        </div>
      </div>
    </section>
  );
}
