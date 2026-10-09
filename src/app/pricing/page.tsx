import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { isPaidTier, PAID_TIERS } from "@/lib/pricing";
import { ContinueCheckout } from "./ContinueCheckout";
import { Banner } from "@/components/ui";
import { PricingTable } from "@/components/PricingTable";
import { getBillingPrices } from "@/lib/billing";
import { getPricingSettings } from "@/lib/offer";
import { headers } from "next/headers";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { error?: string; checkout?: string; continue?: string };
}) {
  const [prices, settings] = await Promise.all([
    getBillingPrices(),
    getPricingSettings(),
  ]);
  /*
    Vercel puts the request's country on this header. Absent locally
    and on any other host, where the page then shows GBP alone, which
    is what everyone sees today.
  */
  const country = headers().get("x-vercel-ip-country");

  /* Back from signing in with a plan already chosen: carry on to it. */
  const wanted = searchParams.continue;
  const {
    data: { user },
  } = await createClient().auth.getUser();
  const resume = user && wanted && isPaidTier(wanted) && !searchParams.error ? wanted : null;

  const notice =
    searchParams.error === "unconfigured"
      ? "Subscriptions aren't switched on yet: please check back soon."
      : searchParams.checkout === "cancelled"
        ? "Checkout cancelled: no charge was made."
        : null;

  /*
    Set in the landing page's wide frame, four plans across, arriving in
    turn and growing under the pointer, so the page matches the pricing
    a visitor has just seen on the landing page rather than squeezing the
    same table into the reading column.
  */
  return (
    <div className="bleed">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-8">
        <TraceHeader
          title="Pricing"
          lede="Start free with sample questions in every topic. Subscribe when you want the full plan, every question, the mock and Ask Pinard."
        />
        {notice && <Banner className="mb-6">{notice}</Banner>}
        {resume && <ContinueCheckout tier={resume} name={PAID_TIERS[resume].name} />}
        <h2 className="sr-only">Plans</h2>
        <PricingTable prices={prices} settings={settings} country={country} wide />
      </div>
    </div>
  );
}
