import { createAdminClient } from "@/lib/supabase/admin";
import { readSettings, writeSetting } from "@/lib/settings";

/**
 * The founding offer, as something the owner sets rather than something
 * the code believes.
 *
 * The pricing page said "Founding member: 30% off your first cycle, for
 * the first 500 subscribers" in a hardcoded banner: the thirty and the
 * five hundred were written into a component, so changing either meant
 * a deploy, and nothing counted how many of the five hundred had gone.
 * A number on a sales page that nobody is counting is a number that
 * stops being true quietly.
 *
 * Held in app_settings, which exists for exactly this and stores text
 * so a setting can grow past true/false without a migration. Nothing to
 * run in SQL.
 */

export const OFFER_ACTIVE = "founding_offer_active";
export const OFFER_PERCENT = "founding_offer_percent";
export const OFFER_PLACES = "founding_offer_places";
export const RESIT_FEE_PENCE = "resit_fee_pence";
/** The Stripe coupon that makes the banner's claim true at the till. */
export const OFFER_COUPON = "founding_offer_coupon";

export type FoundingOffer = {
  active: boolean;
  percent: number;
  places: number;
  /** How many have already subscribed, counted rather than assumed. */
  taken: number;
  /** Never negative, and zero means the offer is spent. */
  left: number;
};

export type PricingSettings = {
  offer: FoundingOffer;
  /** What sitting the exam again costs, if the owner has said. */
  resitFeePence: number | null;
};

const DEFAULTS = { active: false, percent: 30, places: 500 };

function toInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Off until the owner turns it on.
 *
 * The banner was on the page before any of this existed, so defaulting
 * to on would keep showing an offer whose places nobody had chosen. An
 * offer that announces itself is a decision; an offer that announces
 * itself because a default said so is an accident.
 */
export async function getPricingSettings(): Promise<PricingSettings> {
  const values = await readSettings([
    OFFER_ACTIVE,
    OFFER_PERCENT,
    OFFER_PLACES,
    RESIT_FEE_PENCE,
  ]);

  const places = toInt(values[OFFER_PLACES], DEFAULTS.places);
  const taken = await countSubscribers();
  const resit = Number.parseInt(values[RESIT_FEE_PENCE] ?? "", 10);

  return {
    offer: {
      active: values[OFFER_ACTIVE] === "true",
      percent: toInt(values[OFFER_PERCENT], DEFAULTS.percent),
      places,
      taken,
      left: Math.max(0, places - taken),
    },
    resitFeePence: Number.isFinite(resit) && resit > 0 ? resit : null,
  };
}

/**
 * How many places have gone.
 *
 * One row per person in subscriptions, whatever its current status: a
 * founding place is claimed when someone subscribes, and giving it back
 * because they later cancelled would mean the count went down while the
 * discount they used did not.
 */
async function countSubscribers(): Promise<number> {
  try {
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function savePricingSettings(input: {
  active: boolean;
  percent: number;
  places: number;
  resitFeePence: number | null;
}): Promise<{ error?: string }> {
  if (!Number.isFinite(input.percent) || input.percent < 1 || input.percent > 100) {
    return { error: "A discount is between 1% and 100%" };
  }
  if (!Number.isFinite(input.places) || input.places < 1) {
    return { error: "Give the offer at least one place" };
  }
  if (
    input.resitFeePence !== null &&
    (!Number.isFinite(input.resitFeePence) || input.resitFeePence < 0)
  ) {
    return { error: "A resit fee cannot be negative" };
  }

  const writes = await Promise.all([
    writeSetting(OFFER_ACTIVE, input.active ? "true" : "false"),
    writeSetting(OFFER_PERCENT, String(Math.round(input.percent))),
    writeSetting(OFFER_PLACES, String(Math.round(input.places))),
    writeSetting(
      RESIT_FEE_PENCE,
      input.resitFeePence === null ? "" : String(Math.round(input.resitFeePence))
    ),
  ]);
  const failed = writes.find((w) => w.error);
  return failed ? { error: failed.error } : {};
}
