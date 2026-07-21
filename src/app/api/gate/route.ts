import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Construction-gate unlock. When SITE_GATE_PASSWORD is set, the whole site
 * is hidden behind it (enforced in middleware). Submitting the correct
 * password here sets an unlock cookie.
 */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const gate = process.env.SITE_GATE_PASSWORD;
  if (!gate) return NextResponse.redirect(`${origin}/`, 303);

  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (password === gate) {
    const res = NextResponse.redirect(`${origin}/`, 303);
    res.cookies.set("pinard_gate", btoa(gate), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
    return res;
  }

  return NextResponse.redirect(`${origin}/gate?error=1`, 303);
}
