import { TraceHeader } from "@/components/TraceHeader";
import { PricingTable } from "@/components/PricingTable";
import { createClient } from "@/lib/supabase/server";
import { getBillingPrices } from "@/lib/billing";

export default async function PricingPage({
  searchParams,
}: {
  searchParams: { error?: string; checkout?: string };
}) {
  const supabase = createClient();
  const prices = await getBillingPrices(supabase);

  const notice =
    searchParams.error === "unconfigured"
      ? "Subscriptions aren't switched on yet — please check back soon."
      : searchParams.checkout === "cancelled"
        ? "Checkout cancelled — no charge was made."
        : null;

  return (
    <>
      <TraceHeader
        title="Pricing"
        lede="Start free with sample questions in every topic. Upgrade when you want the full adaptive plan."
      />
      {notice && (
        <p className="mb-4 rounded-card border border-hairline bg-porcelain p-3 text-sm text-graphite/70">
          {notice}
        </p>
      )}
      <PricingTable prices={prices} />
    </>
  );
}
