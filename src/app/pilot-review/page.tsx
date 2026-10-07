import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getMyReview, isReviewOpen } from "@/lib/pilotReview";
import { ReviewForm } from "./ReviewForm";

export const metadata: Metadata = {
  title: "Review Pinard",
  robots: { index: false, follow: false },
};

/**
 * Where a pilot assessor scores the site at the end of the pilot.
 *
 * Signed in only, and only while the owner has the review open. A
 * candidate who has already sent one sees it filled in and can change
 * it until the review closes.
 */
export default async function PilotReviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [open, mine] = await Promise.all([isReviewOpen(), getMyReview(user.id)]);

  return (
    <>
      <TraceHeader
        title="Review Pinard"
        eyebrow="Pilot"
        lede="You have used Pinard as a candidate would. Score each part out of ten, tell us what to change, and, if you are willing, write a sentence we can put on the website."
      />
      {open ? (
        <ReviewForm initial={mine} />
      ) : (
        <Card>
          <p className="text-sm leading-relaxed text-ink/80">
            {mine
              ? "Thank you: your review is with us. The review has now closed."
              : "The pilot review is not open at the moment. We will ask you here when it is."}
          </p>
        </Card>
      )}
    </>
  );
}
