import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validUnsubscribe } from "@/lib/unsubscribe";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";

/**
 * Turns reminder emails off for the account a signed link names
 * (lib/unsubscribe). Answers two callers:
 *
 * - a mail app's one-click Unsubscribe (RFC 8058), which POSTs
 *   "List-Unsubscribe=One-Click" here and wants a plain 200;
 * - the button on /unsubscribe, which is sent back to that page.
 *
 * POST only: link scanners in mail systems open every GET, and must not
 * unsubscribe anyone by doing so.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const u = url.searchParams.get("u") ?? form?.get("u");
  const s = url.searchParams.get("s") ?? form?.get("s");
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";

  if (!(await validUnsubscribe(u, s))) {
    return oneClick
      ? NextResponse.json({ error: "Invalid link" }, { status: 400 })
      : NextResponse.redirect(`${siteUrl(request)}/unsubscribe?invalid=1`, 303);
  }

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ reminders_enabled: false })
    .eq("id", u as string);
  if (error) console.error("Unsubscribe failed:", error.code);

  if (oneClick) return new NextResponse(null, { status: error ? 500 : 200 });
  return NextResponse.redirect(`${siteUrl(request)}/unsubscribe?${error ? "failed" : "done"}=1`, 303);
}
