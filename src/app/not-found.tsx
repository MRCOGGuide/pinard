import type { Metadata } from "next";
import { TraceHeader } from "@/components/TraceHeader";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found – Pinard" };

/**
 * Any address that leads nowhere: an old link, a mistyped path, a
 * question that has since been retired. Says what happened in one line
 * and offers the two places most people were trying to reach.
 */
export default function NotFound() {
  return (
    <>
      <TraceHeader
        title="This page does not exist"
        lede="The link may be old, or the address mistyped. Nothing you have done has been lost."
      />
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/">Go to the home page</ButtonLink>
        <ButtonLink href="/sample" variant="secondary">
          Try the questions
        </ButtonLink>
      </div>
    </>
  );
}
