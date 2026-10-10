import "server-only";
import { getPricingSettings } from "@/lib/offer";
import { displayRegion } from "@/lib/region";
import { pricingView, type PricingView } from "@/lib/pricingView";

/** The plans block shown outside /pricing (the landing page, the end of
 *  the free sample): the visitor's own prices, or null while their
 *  region is unconfirmed, in which case the block links to /pricing. */
export type PlansProps = { view: PricingView | null; founding: { percent: number; left: number } | null };

export async function plansProps(): Promise<PlansProps> {
  const [decision, settings] = await Promise.all([displayRegion(), getPricingSettings()]);
  const founding = settings.offer.active && settings.offer.left > 0 ? { percent: settings.offer.percent, left: settings.offer.left } : null;
  if (decision.needsSignals) return { view: null, founding };
  return { view: await pricingView(decision.region, decision.country, Boolean(founding)), founding };
}
