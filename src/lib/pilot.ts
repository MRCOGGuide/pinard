import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The pilot: who gets in before the door opens, who asked to be told
 * when it does, and what they say once they are inside.
 *
 * Every read here is wrapped. These tables arrive with
 * phase36-pilot.sql, and a screen that throws because a migration has
 * not been run yet is a worse failure than one that says there are no
 * codes: the first takes the page down, the second is true until the
 * SQL is run.
 */

export type InviteCode = {
  code: string;
  note: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  /** Whether it would admit someone right now. */
  live: boolean;
};

export type WaitlistEntry = {
  email: string;
  exam: string | null;
  examDate: string | null;
  createdAt: string;
};

export type FeedbackItem = {
  id: number;
  path: string | null;
  message: string;
  createdAt: string;
  readAt: string | null;
  email: string | null;
};

/** A code a human can read over a phone: no O/0, no I/1. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Normalised the way someone would mistype it: case and spacing. */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

function isLive(row: {
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}): boolean {
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return false;
  }
  if (row.max_uses !== null && row.used_count >= row.max_uses) return false;
  return true;
}

export async function listInviteCodes(): Promise<InviteCode[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invite_codes")
      .select("code, note, max_uses, used_count, expires_at")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as {
      code: string;
      note: string | null;
      max_uses: number | null;
      used_count: number;
      expires_at: string | null;
    }[]).map((r) => ({
      code: r.code,
      note: r.note,
      maxUses: r.max_uses,
      usedCount: r.used_count,
      expiresAt: r.expires_at,
      live: isLive(r),
    }));
  } catch {
    return [];
  }
}

export async function createInviteCode(input: {
  note: string;
  maxUses: number | null;
  createdBy?: string;
}): Promise<{ error?: string; code?: string }> {
  const code = generateCode();
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("invite_codes").insert({
      code,
      note: input.note.trim() || null,
      max_uses: input.maxUses,
      created_by: input.createdBy ?? null,
    });
    if (error) return { error: error.message };
    return { code };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Is this code good for one more sign-up?
 *
 * Checked before the account is created, and spent after: a code that
 * admitted somebody whose sign-up then failed has not been used, and a
 * pilot of ten should not lose a place to a mistyped password.
 */
export async function checkInviteCode(
  raw: string
): Promise<{ ok: boolean; code?: string; reason?: string }> {
  const code = normaliseCode(raw);
  if (!code) return { ok: false, reason: "Enter your invite code." };
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invite_codes")
      .select("code, max_uses, used_count, expires_at")
      .eq("code", code)
      .maybeSingle();
    if (error) return { ok: false, reason: "Could not check that code." };
    if (!data) return { ok: false, reason: "That code is not one of ours." };
    if (!isLive(data as Parameters<typeof isLive>[0])) {
      return { ok: false, reason: "That code has been used up or has expired." };
    }
    return { ok: true, code };
  } catch {
    return { ok: false, reason: "Could not check that code." };
  }
}

/** Spend a place on it, and record who took it. */
export async function redeemInviteCode(
  code: string,
  userId: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("invite_redemptions")
      .insert({ code, user_id: userId });
    const { data } = await supabase
      .from("invite_codes")
      .select("used_count")
      .eq("code", code)
      .maybeSingle();
    const used = Number((data as { used_count?: number } | null)?.used_count ?? 0);
    await supabase
      .from("invite_codes")
      .update({ used_count: used + 1 })
      .eq("code", code);
  } catch {
    /* A redemption that cannot be recorded must not stop a sign-up that
       has already succeeded: the account exists either way, and a
       miscounted code is a smaller problem than a candidate locked out
       of one they were given. */
  }
}

export async function joinWaitlist(input: {
  email: string;
  exam?: string | null;
  examDate?: string | null;
}): Promise<{ error?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That does not look like an email address." };
  }
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("waitlist").upsert(
      {
        email,
        exam: input.exam || null,
        exam_date: input.examDate || null,
      },
      { onConflict: "email" }
    );
    if (error) return { error: "Could not add you just now." };
    return {};
  } catch {
    return { error: "Could not add you just now." };
  }
}

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("waitlist")
      .select("email, exam, exam_date, created_at")
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return (data as {
      email: string;
      exam: string | null;
      exam_date: string | null;
      created_at: string;
    }[]).map((r) => ({
      email: r.email,
      exam: r.exam,
      examDate: r.exam_date,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function saveFeedback(input: {
  userId: string;
  path: string;
  message: string;
}): Promise<{ error?: string }> {
  const message = input.message.trim();
  if (message.length < 3) return { error: "Tell me a little more than that." };
  if (message.length > 2000) return { error: "Keep it under 2000 characters." };
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("feedback").insert({
      user_id: input.userId,
      path: input.path.slice(0, 200),
      message,
    });
    if (error) return { error: "Could not send that just now." };
    return {};
  } catch {
    return { error: "Could not send that just now." };
  }
}

export async function listFeedback(): Promise<FeedbackItem[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("feedback")
      .select("id, user_id, path, message, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];

    const rows = data as {
      id: number;
      user_id: string | null;
      path: string | null;
      message: string;
      created_at: string;
      read_at: string | null;
    }[];

    /* Who said it, which lives in auth rather than in the row. */
    const emailById = new Map<string, string>();
    try {
      const { data: users } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? "");
    } catch {
      /* Without it the feedback still reads; only the name is missing. */
    }

    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      message: r.message,
      createdAt: r.created_at,
      readAt: r.read_at,
      email: r.user_id ? emailById.get(r.user_id) ?? null : null,
    }));
  } catch {
    return [];
  }
}

export async function markFeedbackRead(id: number): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("feedback")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  } catch {
    /* Reading is a convenience; losing the mark loses nothing. */
  }
}
