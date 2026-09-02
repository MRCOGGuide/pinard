import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionIdFromToken } from "@/lib/jwt";

/**
 * Refreshes the Supabase auth session on every request, and enforces a
 * single active session per account (anti-sharing): if this request's
 * session id no longer matches the account's active session, sign out.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Construction gate: when SITE_GATE_PASSWORD is set, the entire site is
  // hidden behind it until the visitor enters the code (unlock cookie).
  const gate = process.env.SITE_GATE_PASSWORD;
  if (gate) {
    const unlocked =
      request.cookies.get("pinard_gate")?.value === btoa(gate);
    const onGate = path === "/gate" || path.startsWith("/api/gate");

    // Endpoints machines call, which no one can enter a code for: the
    // Stripe webhook and the generation cron. Both authenticate
    // themselves — a verified Stripe signature, CRON_SECRET — so the
    // gate adds nothing but a 307 that Stripe reads as a failed
    // delivery and cron reads as a run that did nothing.
    const machineEndpoint =
      path.startsWith("/api/stripe/webhook") ||
      path.startsWith("/api/generate/worker");

    if (!unlocked && !onGate && !machineEndpoint) {
      const gateUrl = request.nextUrl.clone();
      gateUrl.pathname = "/gate";
      gateUrl.search = "";
      return NextResponse.redirect(gateUrl);
    }
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Before .env.local is filled in, skip quietly so the shell still renders.
  if (!url || !key || url.includes("YOUR-PROJECT-REF")) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Single-session enforcement. Skip on auth routes to avoid loops.
  const onAuthRoute =
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/auth");

  if (user && !onAuthRoute) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sessionId = sessionIdFromToken(session?.access_token);

    const { data: profile } = await supabase
      .from("profiles")
      .select("active_session_id")
      .eq("id", user.id)
      .maybeSingle();

    // Only enforce once an active session has been claimed and differs.
    if (
      sessionId &&
      profile?.active_session_id &&
      profile.active_session_id !== sessionId
    ) {
      await supabase.auth.signOut();
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/sign-in";
      redirectUrl.search = "?reason=elsewhere";
      const redirect = NextResponse.redirect(redirectUrl);
      // Carry the sign-out cookie clearing onto the redirect.
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
