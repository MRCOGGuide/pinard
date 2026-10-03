import { TraceHeader } from "@/components/TraceHeader";
import { PricingTable } from "@/components/PricingTable";
import { getBillingPrices } from "@/lib/billing";
import { getPricingSettings } from "@/lib/offer";
import { headers } from "next/headers";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { error?: string; checkout?: string };
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

  const notice =
    searchParams.error === "unconfigured"
      ? "Subscriptions aren't switched on yet: please check back soon."
      : searchParams.checkout === "cancelled"
        ? "Checkout cancelled: no charge was made."
        : null;

  return (
    <>
      <TraceHeader
        title="Pricing"
        lede="Start free with sample questions in every topic. Upgrade when you want the full adaptive plan."
      />
      {notice && (
        <p className="mb-4 rounded-card border border-line bg-surface p-3 text-sm text-ink/70">
          {notice}
        </p>
      )}
      <PricingTable prices={prices} settings={settings} country={country} />
    </>
  );
}
