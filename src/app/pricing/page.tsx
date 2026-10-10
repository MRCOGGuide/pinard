import { TraceHeader } from "@/components/TraceHeader";
import { Banner } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getPricingSettings } from "@/lib/offer";
import { displayRegion } from "@/lib/region";
import { pricingView } from "@/lib/pricingView";
import { getPlan } from "@/lib/plan";
import { recordFunnel } from "@/lib/funnel";
import { PAID_TIERS, TIER_NAMES, type PaidTier } from "@/config/pricing";
import { ContinueCheckout } from "./ContinueCheckout";
import { PricingPlans } from "./PricingPlans";
import { PriceCheck } from "./PriceCheck";

// Prices depend on the visitor, so the page is never cached.
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  unconfigured: "Subscriptions aren't switched on yet: please check back soon.",
  busy: "Too many attempts from here just now. Please try again in a few minutes.",
  country: "We can't sell subscriptions in your country yet.",
  plan: "Please choose a plan below.",
};

export default async function PricingPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ error?: string; checkout?: string; continue?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [decision, settings] = await Promise.all([displayRegion(), getPricingSettings()]);
  const offer = settings.offer.active && settings.offer.left > 0 ? { percent: settings.offer.percent, left: settings.offer.left } : null;

  let currentTier: string | null = null;
  let examWeeks: number | null = null;
  if (user) {
    const plan = await getPlan(supabase, user.id);
    currentTier = plan.admin ? null : plan.tier;
    const { data: profile } = await supabase.from("profiles").select("exam_date").eq("id", user.id).maybeSingle();
    if (profile?.exam_date) {
      examWeeks = Math.ceil((Date.parse(profile.exam_date as string) - Date.now()) / (7 * 86_400_000));
    }
  }

  // Back from signing in with a plan already chosen: carry on to it.
  const [wantTier, wantInterval] = String(searchParams.continue ?? "").split("-");
  const resume =
    user && PAID_TIERS.includes(wantTier as PaidTier) && ["month", "quarter"].includes(wantInterval) && !searchParams.error
      ? { tier: wantTier, interval: wantInterval }
      : null;

  const notice = searchParams.error
    ? (NOTICES[searchParams.error] ?? "Something went wrong. Please try again.")
    : searchParams.checkout === "cancelled"
      ? "Checkout cancelled: no charge was made."
      : null;

  if (!decision.needsSignals) {
    await recordFunnel("pricing_viewed", { region: decision.region, userId: user?.id ?? null, country: decision.country });
  }
  const view = decision.needsSignals ? null : await pricingView(decision.region, decision.country, Boolean(offer));

  return (
    <div className="bleed">
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-8">
        <TraceHeader
          title="Pricing"
          lede="Start free with 15 sample questions, the sample diagnostic and a preview of your plan. Subscribe for the full Part 2 bank, your study plan, mock papers and Ask Pinard."
        />
        {notice && <Banner className="mb-6">{notice}</Banner>}
        {resume && (
          <ContinueCheckout tier={resume.tier} interval={resume.interval} name={TIER_NAMES[resume.tier as PaidTier]} />
        )}
        <h2 className="sr-only">Plans</h2>
        {view ? (
          <PricingPlans view={view} signedIn={Boolean(user)} currentTier={currentTier} founding={offer} examWeeks={examWeeks} />
        ) : (
          <PriceCheck signedIn={Boolean(user)} currentTier={currentTier} founding={offer} examWeeks={examWeeks} />
        )}
      </div>
    </div>
  );
}
