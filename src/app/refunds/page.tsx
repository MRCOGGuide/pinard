import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refunds, Cancellation & Withdrawal: Pinard",
};

// Read on each visit, so a change saved in Admin shows at once.
export const dynamic = "force-dynamic";

export default function RefundsPage() {
  return <LegalPage doc="refunds" />;
}
