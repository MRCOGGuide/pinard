"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmPricingSignals } from "./actions";

/**
 * Shown while the browser confirms its time zone and language for the
 * IP country (lib/region). Sends those two signals only, then reloads
 * the page's prices; until then no price is shown, so nobody sees one
 * price change into another.
 */
export function PriceCheck() {
  const router = useRouter();
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const language = navigator.language ?? "";
    void confirmPricingSignals({ timeZone, language }).then(() => router.refresh());
  }, [router]);
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading prices">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[30rem] animate-pulse rounded-card border border-line bg-sunk motion-reduce:animate-none" />
      ))}
    </div>
  );
}
