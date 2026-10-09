import Stripe from "stripe";

/** Server-side Stripe client. Null when not yet configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * VAT at checkout (Phase 11), switched on with STRIPE_TAX_ENABLED=true.
 *
 * Stripe Tax works out the VAT from the buyer's billing address, for
 * the countries where Pinard is registered (Stripe Dashboard > Tax >
 * Registrations) and nowhere else. Every price is VAT-inclusive, so the
 * buyer pays the price on the pricing page wherever they are, and the
 * VAT comes out of it: "the price shown is the total you pay" stays
 * true. Off, checkout is exactly as before.
 *
 * The address is asked for on Stripe's page and saved to the customer
 * (customer_update), because the customer already exists by then and
 * Stripe Tax needs its address.
 */
export function taxEnabled(): boolean {
  return process.env.STRIPE_TAX_ENABLED === "true";
}

export function checkoutTaxParams(): {
  automatic_tax?: { enabled: true };
  billing_address_collection?: "required";
  customer_update?: { address: "auto"; name: "auto" };
} {
  if (!taxEnabled()) return {};
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
  };
}
