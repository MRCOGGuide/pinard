import { createAdminClient } from "@/lib/supabase/admin";
import { PILOT_REVIEW_PATH } from "@/lib/pilotReview";

/**
 * What each candidate has actually done, for the Users page.
 *
 * Built for the pilot: before an assessor scores Ask Pinard or the mock,
 * the owner should be able to see whether they used it, and who signed
 * up and has not answered a question since.
 *
 * Answers and chat messages are counted per user with a head query
 * rather than read in full, so the page costs a query or two per user
 * rather than every answer ever given; the small tables (mocks, Ask
 * usage, reviews) are read whole.
 */
export type UserActivity = {
  lastActive: string | null;
  answered: number;
  diagnosticAt: string | null;
  mocks: number;
  asks: number;
  reviewed: boolean;
};

const BATCH = 20;

export async function activityFor(
  users: { id: string; lastSignIn: string | null }[]
): Promise<Map<string, UserActivity>> {
  const db = createAdminClient();
  const ids = users.map((u) => u.id);
  const out = new Map<string, UserActivity>();
  if (!ids.length) return out;

  const [profiles, mocks, askUsage, reviews] = await Promise.all([
    db.from("profiles").select("id, diagnostic_completed_at").in("id", ids),
    db.from("mock_attempts").select("user_id").in("user_id", ids),
    db.from("ask_usage").select("user_id, used").in("user_id", ids),
    db.from("feedback").select("user_id").eq("path", PILOT_REVIEW_PATH).in("user_id", ids),
  ]);

  const diag = new Map((profiles.data ?? []).map((p) => [p.id as string, (p.diagnostic_completed_at as string | null) ?? null]));
  const mockCount = new Map<string, number>();
  for (const m of mocks.data ?? []) mockCount.set(m.user_id as string, (mockCount.get(m.user_id as string) ?? 0) + 1);
  const askCount = new Map<string, number>();
  for (const a of askUsage.data ?? []) askCount.set(a.user_id as string, (askCount.get(a.user_id as string) ?? 0) + Number(a.used ?? 0));
  const reviewed = new Set((reviews.data ?? []).map((r) => r.user_id as string));

  const signIn = new Map(users.map((u) => [u.id, u.lastSignIn]));
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(
      ids.slice(i, i + BATCH).map(async (id) => {
        const [answers, chats] = await Promise.all([
          db
            .from("user_answers")
            .select("answered_at", { count: "exact" })
            .eq("user_id", id)
            .order("answered_at", { ascending: false })
            .limit(1),
          db
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", id)
            .eq("role", "user"),
        ]);
        const lastAnswer = (answers.data?.[0]?.answered_at as string | undefined) ?? null;
        const lastSignIn = signIn.get(id) ?? null;
        const lastActive =
          lastAnswer && lastSignIn ? (lastAnswer > lastSignIn ? lastAnswer : lastSignIn) : lastAnswer ?? lastSignIn;
        out.set(id, {
          lastActive,
          answered: answers.count ?? 0,
          diagnosticAt: diag.get(id) ?? null,
          mocks: mockCount.get(id) ?? 0,
          // Library questions on Today, plus follow-ups on question cards.
          asks: (askCount.get(id) ?? 0) + (chats.count ?? 0),
          reviewed: reviewed.has(id),
        });
      })
    );
  }
  return out;
}
