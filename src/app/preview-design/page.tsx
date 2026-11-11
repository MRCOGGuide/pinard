import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Instrument_Sans } from "next/font/google";
import { plansProps } from "@/lib/plansProps";
import { getExamAvailability } from "@/lib/examAvailability";
import { getShowcase } from "@/lib/showcase";
import { getLibrarySize } from "@/lib/library";
import { getTestimonials } from "@/lib/offer";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewDesign } from "./_parts/PreviewDesign";
import "../preview-landing/preview.css";
import "./design.css";

/**
 * The second proposed design, for the owner to judge beside the live
 * page at / and the first proposal at /preview-landing. Local only: a
 * production build shows the not-found page here. It reads the same
 * counts, prices and sample question as /.
 *
 * What is new against the first proposal: the opening (the horn itself,
 * drawn live and able to be turned), the interface typeface, and the
 * scale and weight of the headings. The pictures further down are the
 * first proposal's, which already follow the scroll and the hand.
 */
export const metadata: Metadata = {
  title: "Design preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* The interface face on trial (see ./type for the comparison). */
const instrument = Instrument_Sans({ subsets: ["latin"], display: "swap" });

export default async function PreviewDesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [plans, availability, showcase, library, testimonials] = await Promise.all([
    plansProps(),
    getExamAvailability(createAdminClient()),
    getShowcase(),
    getLibrarySize(),
    getTestimonials(),
  ]);

  return (
    <>
      {/* The face has to reach the top bar and the footer too, which sit
          outside this page, so it is set on the body for as long as this
          page is the one showing. */}
      <style>{`body:has(.pd-root){--font-ui:${instrument.style.fontFamily};--font-sans:${instrument.style.fontFamily};--font-mono:${instrument.style.fontFamily}}`}</style>
      <PreviewDesign
        plans={plans}
        availability={availability}
        showcase={showcase}
        library={library}
        testimonials={testimonials}
      />
    </>
  );
}
