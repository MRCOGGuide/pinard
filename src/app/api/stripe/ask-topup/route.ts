import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/site";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "@/lib/plan";
import { priceIdFor, topUpLookupKey } from "@/lib/catalogue";
import { withinRateLimit } from "@/lib/rateLimit";
import { TOP_UPS, type TopUpId } from "@/config/pricing";

export const runtime = "nodejs";

/**
 * Buying an Ask Pinard top-up pack (pricing Phase 2): 50 or 150 extra
 * questions, a one-off payment, the same price in every region. The
 * webhook grants the questions once Stripe confirms payment; nothing
 * here writes an allowance. Paid subscribers only.
 */
export async function POST(request: Request) {
  const origin = siteUrl(request);
  const stripe = getStripe();
  if (!stripe) return NextResponse.redirect(`${origin}/account?error=unconfigured`, 303);
  if (!(await withinRateLimit("topup", 20, 60 * 60 * 1000))) {
    return NextResponse.redirect(`${origin}/account?error=busy`, 303);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/sign-in`, 303);

  const plan = await getPlan(supabase, user.id);
  if (!plan.subscribed || plan.admin) return NextResponse.redirect(`${origin}/pricing`, 303);

  // The consent the form requires, checked here too (Phase 11).
  const form = await request.formData().catch(() => null);
  if (form?.get("consent") !== "yes") return NextResponse.redirect(`${origin}/account?topup=consent`, 303);

  const pack = TOP_UPS.find((t) => t.id === String(form?.get("pack") ?? "")) ?? TOP_UPS[0];
  const price = await priceIdFor(stripe, topUpLookupKey(pack.id as TopUpId));
  if (!price) return NextResponse.redirect(`${origin}/account?error=unconfigured`, 303);

  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id, name").eq("id", user.id).single();
  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: profile?.name || undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    await createAdminClient().from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    managed_payments: { enabled: true },
    metadata: { user_id: user.id, kind: "ask_topup", questions: String(pack.questions) },
    custom_text: {
      submit: {
        message:
          "You asked for these questions straight away and confirmed that you lose the right to withdraw once you use one.",
      },
    },
    success_url: `${origin}/account?topup=success`,
    cancel_url: `${origin}/account?topup=cancelled`,
  });
  return NextResponse.redirect(session.url!, 303);
}
