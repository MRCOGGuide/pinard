import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Download my data (Phase 11): everything linked to the signed-in
 * account, as one JSON file. The rights of access and portability
 * (GDPR articles 15 and 20), served without anyone having to ask.
 *
 * Read with the service role, because candidates can no longer read
 * every table they have rows in (security audit L1), and filtered to
 * this account in every query. A table missing from this database (a
 * migration not yet run) is noted in the file rather than failing it.
 */
const BY_USER_ID = [
  "user_answers",
  "user_topic_performance",
  "mock_attempts",
  "study_plans",
  "chat_messages",
  "user_question_flags",
  "subscriptions",
  "ask_usage",
  "ask_credits",
  "notifications_log",
  "invite_redemptions",
  "feedback",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to download your data." }, { status: 401 });
  }

  const admin = createAdminClient();
  const tables: Record<string, unknown> = {};

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  tables.profile = profileError ? { unavailable: true } : profile;

  await Promise.all(
    BY_USER_ID.map(async (table) => {
      const { data, error } = await admin.from(table).select("*").eq("user_id", user.id).limit(50_000);
      tables[table] = error ? { unavailable: true } : data;
    })
  );

  if (user.email) {
    const { data } = await admin.from("waitlist").select("*").eq("email", user.email.toLowerCase());
    tables.waitlist = data ?? [];
  }

  const body = {
    about:
      "Everything Pinard holds that is linked to your account, as of the date below. Payment card details are held by Stripe, not Pinard. For questions, see pinardapp.com/privacy.",
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      name: (user.user_metadata as { name?: string } | null)?.name ?? null,
    },
    ...tables,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pinard-my-data-${day}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
