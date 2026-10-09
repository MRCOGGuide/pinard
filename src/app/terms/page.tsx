import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions: Pinard",
};

// Read on each visit, so a change saved in Admin shows at once.
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalPage doc="terms" />;
}
