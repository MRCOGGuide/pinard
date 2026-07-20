import { TraceHeader } from "@/components/TraceHeader";
import { PricingTable } from "@/components/PricingTable";

export default function PricingPage() {
  return (
    <>
      <TraceHeader
        title="Pricing"
        lede="Start free with sample questions in every topic. Upgrade when you want the full adaptive plan."
      />
      <PricingTable />
    </>
  );
}
