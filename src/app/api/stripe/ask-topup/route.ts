import { NextResponse } from "next/server";
import { getAccess, hasFullAccess } from "@/lib/access";
import { ASK_TOPUP_QUESTIONS } from "@/lib/askAllowance";
import { siteUrl } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Buying another hundred Ask Pinard questions.
 *
 * A one-off payment rather than a second subscription: the questions
 * last until the end of the period already paid for, so someone on a
 * quarterly plan who buys in week two still has them in week eleven.
 * The webhook works out that expiry from the live subscription and
 * grants the credits; nothing here writes an allowance, because a
 * candidate must not be able to grant themselves one by opening a URL.
 *
 * Only offered to subscribers. A top-up on a free account would buy
 * questions against a feature they cannot reach.
 */
export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.redirect(`${origin}/account?error=unconfigured`, 303);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/sign-in`, 303);

  const access = await getAccess(supabase, user.id);
  if (!hasFullAccess(access)) {
    return NextResponse.redirect(`${origin}/pricing`, 303);
  }

  const price = process.env.STRIPE_PRICE_ASK_TOPUP;
  if (!price) {
    return NextResponse.redirect(`${origin}/account?error=unconfigured`, 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, name")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile?.name || undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    // Read back by the webhook. client_reference_id alone would not say
    // what was bought, and this endpoint is not the only one using it.
    metadata: {
      user_id: user.id,
      kind: "ask_topup",
      questions: String(ASK_TOPUP_QUESTIONS),
    },
    success_url: `${origin}/account?topup=success`,
    cancel_url: `${origin}/account?topup=cancelled`,
  });

  return NextResponse.redirect(session.url!, 303);
}
