import Link from "next/link";
import { PricingPlans } from "@/app/pricing/PricingPlans";
import type { PlansProps } from "@/lib/plansProps";

/** The four plans wherever they appear outside /pricing. */
export function PlansBlock({ plans, signedIn = false }: { plans?: PlansProps | null; signedIn?: boolean }) {
  if (!plans?.view) {
    return (
      <p className="text-center">
        <Link
          href="/pricing"
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
        >
          See plans and prices
        </Link>
      </p>
    );
  }
  return <PricingPlans view={plans.view} signedIn={signedIn} currentTier={null} founding={plans.founding} examWeeks={null} />;
}
