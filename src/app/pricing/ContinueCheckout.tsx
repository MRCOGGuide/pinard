"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui";
import { RegionSignals } from "@/components/RegionSignals";

/**
 * Picks up where a signed-out visitor left off.
 *
 * Choosing a plan while signed out goes to sign-in, and sign-in comes
 * back here with ?continue=<tier>-<interval>. This posts the same form the card
 * would have posted, so the visitor carries straight on to Stripe's
 * checkout instead of landing on a page and having to find the plan
 * again. The button is there in case the browser holds the form back.
 */
export function ContinueCheckout({ tier, interval, name }: { tier: string; interval: string; name: string }) {
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    form.current?.requestSubmit();
  }, []);
  return (
    <form
      ref={form}
      action="/api/stripe/checkout"
      method="post"
      role="status"
      className="pop-in mb-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-good/40 bg-good/5 p-4"
    >
      <input type="hidden" name="tier" value={tier} />
      <input type="hidden" name="interval" value={interval} />
      <RegionSignals />
      <p className="font-ui text-[16px] text-ink-strong">
        Taking you to secure checkout for <span className="font-semibold">{name}</span>…
      </p>
      <Button type="submit" size="sm">
        Continue to checkout
      </Button>
    </form>
  );
}
