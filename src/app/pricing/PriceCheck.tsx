"use client";

import { useEffect, useState } from "react";
import type { PricingView } from "@/lib/pricingView";
import { confirmPricingSignals } from "./actions";
import { PricingPlans } from "./PricingPlans";

/**
 * Shown while the browser confirms its time zone and language for the
 * IP country (lib/region). Sends those two signals only, then shows the
 * prices the server returns for them; until then no price is shown, so
 * nobody sees one price change into another.
 *
 * The prices come back from the check itself rather than from a reload,
 * so they appear whether or not the visitor accepted cookies.
 */
export function PriceCheck(props: {
  signedIn: boolean;
  currentTier: string | null;
  founding: { percent: number; left: number } | null;
  examWeeks: number | null;
}) {
  const [view, setView] = useState<PricingView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const language = navigator.language ?? "";
    void confirmPricingSignals({ timeZone, language })
      .then((r) => (r.view ? setView(r.view) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  if (view) return <PricingPlans view={view} {...props} />;
  if (failed) {
    return (
      <p className="mt-6 rounded-card border border-line bg-surface p-5 font-ui text-[16px] text-ink/80">
        Prices could not be loaded just now. Refresh the page to try again.
      </p>
    );
  }
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading prices">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[30rem] animate-pulse rounded-card border border-line bg-sunk motion-reduce:animate-none" />
      ))}
    </div>
  );
}
