import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GATE_COOKIE,
  GATE_LOCK_MS,
  GATE_MAX_FAILURES,
  GATE_WINDOW_MS,
  constantTimeEqual,
  gateToken,
  requestIp,
  visitorKey,
} from "@/lib/gate";

export const runtime = "nodejs";

type Attempts = {
  visitor: string;
  failures: number;
  first_failed_at: string;
  locked_until: string | null;
};

/**
 * Exchange the pre-launch access code for the gate cookie.
 *
 * Rate-limited (security audit H4): ten wrong codes from one visitor in
 * fifteen minutes locks that visitor out for fifteen, counted in
 * gate_attempts (supabase/phase42-gate-attempts.sql). A locked visitor
 * is refused before the code is even compared, so a correct guess made
 * during the lockout does not get through either.
 *
 * Until that SQL has been run the table does not exist, and the limit
 * cannot be kept; the gate still works, and the failure to count is
 * logged rather than locking everyone out of the site.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  // Trimmed on both sides: the stored value picks up a trailing
  // newline when it is pasted into the hosting dashboard, and a typed
  // code picks up a space from autofill or a phone keyboard. Neither
  // is part of anybody's access code.
  const gate = process.env.SITE_GATE_PASSWORD?.trim();
  if (!gate) return NextResponse.redirect(`${origin}/`, 303);

  const form = await request.formData().catch(() => null);
  // Capped: nobody's access code is longer, and comparing a megabyte
  // of input is work for nothing.
  const password = String(form?.get("password") ?? "").trim().slice(0, 128);

  const visitor = await visitorKey(requestIp(request.headers));
  const admin = createAdminClient();
  const now = Date.now();

  let attempts: Attempts | null = null;
  let counting = true;
  {
    const { data, error } = await admin
      .from("gate_attempts")
      .select("visitor, failures, first_failed_at, locked_until")
      .eq("visitor", visitor)
      .maybeSingle();
    if (error) {
      counting = false;
      console.error("gate: attempts not counted (run supabase/phase42-gate-attempts.sql):", error.code);
    } else {
      attempts = data as Attempts | null;
    }
  }

  if (attempts?.locked_until && Date.parse(attempts.locked_until) > now) {
    return NextResponse.redirect(`${origin}/gate?error=locked`, 303);
  }

  if (password && constantTimeEqual(password, gate)) {
    if (counting && attempts) await admin.from("gate_attempts").delete().eq("visitor", visitor);
    const res = NextResponse.redirect(`${origin}/`, 303);
    res.cookies.set(GATE_COOKIE, await gateToken(gate), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  }

  if (counting) {
    // A window that has passed starts again from this failure.
    const fresh = !attempts || now - Date.parse(attempts.first_failed_at) > GATE_WINDOW_MS;
    const failures = fresh ? 1 : (attempts?.failures ?? 0) + 1;
    const locked = failures >= GATE_MAX_FAILURES;
    await admin.from("gate_attempts").upsert({
      visitor,
      failures: locked ? 0 : failures,
      first_failed_at: fresh ? new Date(now).toISOString() : attempts!.first_failed_at,
      locked_until: locked ? new Date(now + GATE_LOCK_MS).toISOString() : null,
    });
    if (locked) return NextResponse.redirect(`${origin}/gate?error=locked`, 303);
  }

  return NextResponse.redirect(`${origin}/gate?error=1`, 303);
}
