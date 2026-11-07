import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { plansProps } from "@/lib/plansProps";
import { getExamAvailability } from "@/lib/examAvailability";
import { getShowcase } from "@/lib/showcase";
import { getLibrarySize } from "@/lib/library";
import { getTestimonials } from "@/lib/offer";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewLanding } from "./_parts/PreviewLanding";
import "./preview.css";

/**
 * A proposed landing page, for the owner to judge beside the real one
 * at /. Local only: a production build shows the not-found page here,
 * so it cannot reach visitors even if the branch is merged by mistake.
 * It reads the same data as / so the counts, prices and sample question
 * are the real ones.
 */
export const metadata: Metadata = {
  title: "Landing preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PreviewLandingPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [plans, availability, showcase, library, testimonials] = await Promise.all([
    plansProps(),
    getExamAvailability(createAdminClient()),
    getShowcase(),
    getLibrarySize(),
    getTestimonials(),
  ]);

  return (
    <PreviewLanding
      plans={plans}
      availability={availability}
      showcase={showcase}
      library={library}
      testimonials={testimonials}
    />
  );
}
