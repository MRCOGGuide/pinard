import { createAdminClient } from "@/lib/supabase/admin";
import { readSetting, writeSetting } from "@/lib/settings";
import { REVIEW_AREAS, type PilotReview, type ReviewAreaKey, type StoredReview } from "@/lib/pilotReviewShared";

export * from "@/lib/pilotReviewShared";

/**
 * The pilot's closing review: every part of the site scored out of ten,
 * a comment the assessor agrees may be published, and anything they
 * would rather say only to us.
 *
 * Stored in the feedback table under its own path rather than in a new
 * table, so the review can open without a migration: the feedback table
 * already has the user, the time and a text column, already refuses the
 * anon and authenticated keys, and already has a screen. The review is
 * one JSON message per assessor, rewritten if they come back and change
 * it.
 *
 * The owner opens and closes it from the pilot page. While it is open,
 * every signed-in candidate is asked, once, on Today.
 */

export const PILOT_REVIEW_OPEN = "pilot_review_open";
export const PILOT_REVIEW_PATH = "pilot-review";

export async function isReviewOpen(): Promise<boolean> {
  return (await readSetting(PILOT_REVIEW_OPEN)) === "true";
}

export async function setReviewOpen(open: boolean): Promise<{ error?: string }> {
  return writeSetting(PILOT_REVIEW_OPEN, open ? "true" : "false");
}

/** Read a stored message back into a review, or null if it is not one. */
function parse(message: string): PilotReview | null {
  try {
    const raw = JSON.parse(message) as Partial<PilotReview>;
    if (!raw || typeof raw !== "object" || !raw.scores) return null;
    const scores = {} as Record<ReviewAreaKey, number | null>;
    for (const area of REVIEW_AREAS) {
      const v = (raw.scores as Record<string, unknown>)[area.key];
      scores[area.key] = typeof v === "number" && v >= 1 && v <= 10 ? Math.round(v) : null;
    }
    return {
      scores,
      publicComment: String(raw.publicComment ?? ""),
      privateComment: String(raw.privateComment ?? ""),
      displayName: String(raw.displayName ?? ""),
      displayDetail: String(raw.displayDetail ?? ""),
      consent: raw.consent === true,
    };
  } catch {
    return null;
  }
}

/** Their own review, if they have sent one. */
export async function getMyReview(userId: string): Promise<PilotReview | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("feedback")
      .select("message")
      .eq("user_id", userId)
      .eq("path", PILOT_REVIEW_PATH)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? parse(data.message as string) : null;
  } catch {
    return null;
  }
}

/** One review per assessor: a second sending replaces the first. */
export async function saveReview(userId: string, review: PilotReview): Promise<{ error?: string }> {
  try {
    const supabase = createAdminClient();
    const message = JSON.stringify(review);
    const { data: existing } = await supabase
      .from("feedback")
      .select("id")
      .eq("user_id", userId)
      .eq("path", PILOT_REVIEW_PATH);
    const ids = (existing ?? []).map((r) => r.id as number);
    if (ids.length) {
      const { error } = await supabase
        .from("feedback")
        .update({ message, created_at: new Date().toISOString(), read_at: null })
        .eq("id", ids[0]);
      if (error) return { error: "Could not save your review just now." };
      if (ids.length > 1) await supabase.from("feedback").delete().in("id", ids.slice(1));
      return {};
    }
    const { error } = await supabase
      .from("feedback")
      .insert({ user_id: userId, path: PILOT_REVIEW_PATH, message });
    if (error) return { error: "Could not save your review just now." };
    return {};
  } catch {
    return { error: "Could not save your review just now." };
  }
}

/** Every review, newest first, with who sent it. */
export async function listReviews(): Promise<StoredReview[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("feedback")
      .select("id, user_id, message, created_at")
      .eq("path", PILOT_REVIEW_PATH)
      .order("created_at", { ascending: false });
    if (error || !data) return [];

    const emailById = new Map<string, string>();
    try {
      const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? "");
    } catch {
      /* The reviews still read without the addresses. */
    }

    const out: StoredReview[] = [];
    for (const row of data as { id: number; user_id: string | null; message: string; created_at: string }[]) {
      const review = parse(row.message);
      if (!review) continue;
      out.push({
        ...review,
        id: row.id,
        userId: row.user_id,
        email: row.user_id ? emailById.get(row.user_id) ?? null : null,
        submittedAt: row.created_at,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** The mean of each area across the reviews that scored it. */
export function averages(reviews: StoredReview[]): Record<ReviewAreaKey, { mean: number | null; n: number }> {
  const out = {} as Record<ReviewAreaKey, { mean: number | null; n: number }>;
  for (const area of REVIEW_AREAS) {
    const values = reviews.map((r) => r.scores[area.key]).filter((v): v is number => v !== null);
    out[area.key] = {
      mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
      n: values.length,
    };
  }
  return out;
}
