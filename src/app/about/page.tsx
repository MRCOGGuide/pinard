import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { ButtonLink } from "@/components/ui";
import { ScrollFade } from "@/components/scroll";
import { SIGN_UP_LABEL } from "@/lib/launch";
import { AboutStory } from "./AboutStory";
import { getLibrarySize } from "@/lib/library";

export const metadata: Metadata = {
  title: "How Pinard works – MRCOG revision from current guidance",
  description:
    "Where Pinard's questions come from: written from current RCOG, NICE and TOG guidance, citation-checked, approved by a Member of the RCOG, and refreshed every quarter across Pinard's revision sections.",
};

/**
 * How it works: what stands behind the questions, in three pictures.
 *
 * Rebuilt twice. It was seven identical cards; then plain sections of
 * prose; now, at the owner's request, three short sections each with a
 * moving picture (AboutStory), fading in and out as they are reached,
 * and nothing the landing page already says. Set in the landing page's
 * wide frame so moving between the two does not shift the layout.
 */
export default async function AboutPage() {
  const library = await getLibrarySize();
  return (
    <div className="bleed">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-8">
        <ScrollFade as="div">
          <TraceHeader
            title="How Pinard works"
            lede="Named for the Pinard stethoscope: it listens to your answers and hears where you are weakest before the exam does."
          />
        </ScrollFade>

        <AboutStory sections={library.sections} />

        <ScrollFade as="div" className="border-t border-line py-12 sm:py-16">
          <h2 className="font-display text-[26px] font-semibold leading-snug text-ink-strong sm:text-[30px]">
            What it is not
          </h2>
          <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/80">
            A revision aid, not a source of clinical advice. No revision tool can
            promise you will pass; Pinard makes sure your practice is current and
            aimed where it will move your result.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/sign-up">{SIGN_UP_LABEL}</ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">
              See pricing
            </ButtonLink>
            <ButtonLink href="/faq" variant="quiet">
              Read the FAQ
            </ButtonLink>
          </div>
        </ScrollFade>
      </div>
    </div>
  );
}
