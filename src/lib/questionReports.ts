import { createAdminClient } from "@/lib/supabase/admin";
import { REPORT_NOTE_LIMIT, REPORT_REASONS, type ReportReason } from "@/lib/questionReportReasons";

/**
 * Candidates telling the owner a question is wrong, and every other
 * route by which a question's correctness has been challenged, in one
 * list.
 *
 * Two sources. A report is written by the "Report a problem" control on
 * an answered question and kept in the feedback table under the path
 * question-report:<id>, so it needs no migration and inherits that
 * table's closed policies. A challenge is what Ask Pinard records when
 * a candidate argues with a question and the tutor agrees: those went
 * to generation_failures, where they sat among the generator's own
 * rejections filed as "other".
 */

export const REPORT_PATH_PREFIX = "question-report:";
const CHALLENGE_PREFIX = "chat challenge on question ";

export type CandidateReport = {
  /** "report-12" or "challenge-345": the row and the table it lives in. */
  ref: string;
  kind: "report" | "challenge";
  questionId: number;
  stem: string | null;
  status: string | null;
  reason: string;
  note: string;
  email: string | null;
  createdAt: string;
  resolved: boolean;
};

export async function saveQuestionReport(input: {
  userId: string;
  questionId: number;
  reason: string;
  note: string;
}): Promise<{ error?: string }> {
  if (!REPORT_REASONS.some((r) => r.key === input.reason)) return { error: "Choose what is wrong with it." };
  const note = input.note.trim().slice(0, REPORT_NOTE_LIMIT);
  if (input.reason === "other" && note.length < 3) return { error: "Say what is wrong with it." };
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("feedback").insert({
      user_id: input.userId,
      path: `${REPORT_PATH_PREFIX}${input.questionId}`,
      message: JSON.stringify({ reason: input.reason as ReportReason, note }),
    });
    if (error) return { error: "Could not send that just now." };
    return {};
  } catch {
    return { error: "Could not send that just now." };
  }
}

/** Open reports first, newest first within each. */
export async function listCandidateReports(): Promise<CandidateReport[]> {
  try {
    const supabase = createAdminClient();
    const [reports, challenges] = await Promise.all([
      supabase
        .from("feedback")
        .select("id, user_id, path, message, created_at, read_at")
        .like("path", `${REPORT_PATH_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("generation_failures")
        .select("id, reason, raw_response, created_at, resolved")
        .like("reason", `${CHALLENGE_PREFIX}%`)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const out: CandidateReport[] = [];
    for (const r of (reports.data ?? []) as {
      id: number; user_id: string | null; path: string; message: string; created_at: string; read_at: string | null;
    }[]) {
      let reason = "other";
      let note = r.message;
      try {
        const parsed = JSON.parse(r.message) as { reason?: string; note?: string };
        reason = parsed.reason ?? "other";
        note = parsed.note ?? "";
      } catch {
        /* An unparsed message is still shown, as its note. */
      }
      out.push({
        ref: `report-${r.id}`,
        kind: "report",
        questionId: Number(r.path.slice(REPORT_PATH_PREFIX.length)),
        stem: null,
        status: null,
        reason,
        note,
        email: r.user_id,
        createdAt: r.created_at,
        resolved: Boolean(r.read_at),
      });
    }
    for (const c of (challenges.data ?? []) as {
      id: number; reason: string; raw_response: string | null; created_at: string; resolved: boolean;
    }[]) {
      const m = /chat challenge on question (\d+): ([\s\S]*)/.exec(c.reason);
      if (!m) continue;
      out.push({
        ref: `challenge-${c.id}`,
        kind: "challenge",
        questionId: Number(m[1]),
        stem: null,
        status: null,
        reason: "challenge",
        note: `${m[2]}${c.raw_response ? `\n\nPinard replied: ${c.raw_response}` : ""}`,
        email: null,
        createdAt: c.created_at,
        resolved: c.resolved,
      });
    }

    /* The question each is about, and who sent the reports. */
    const ids = Array.from(new Set(out.map((o) => o.questionId))).filter(Boolean);
    if (ids.length) {
      const { data: qs } = await supabase.from("generated_questions").select("id, stem, status").in("id", ids);
      const byId = new Map((qs ?? []).map((q) => [q.id as number, q as { stem: string; status: string }]));
      for (const o of out) {
        const q = byId.get(o.questionId);
        o.stem = q?.stem ?? null;
        o.status = q?.status ?? null;
      }
    }
    const userIds = out.map((o) => o.email).filter((e): e is string => Boolean(e));
    if (userIds.length) {
      try {
        const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? ""]));
        for (const o of out) if (o.email) o.email = emailById.get(o.email) ?? null;
      } catch {
        for (const o of out) o.email = null;
      }
    }

    return out.sort(
      (a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt.localeCompare(a.createdAt)
    );
  } catch {
    return [];
  }
}

export async function resolveCandidateReport(ref: string, resolved: boolean): Promise<{ error?: string }> {
  const m = /^(report|challenge)-(\d+)$/.exec(ref);
  if (!m) return { error: "Unknown report." };
  const supabase = createAdminClient();
  const id = Number(m[2]);
  const { error } =
    m[1] === "report"
      ? await supabase.from("feedback").update({ read_at: resolved ? new Date().toISOString() : null }).eq("id", id)
      : await supabase.from("generation_failures").update({ resolved }).eq("id", id);
  return error ? { error: error.message } : {};
}

/** How many are waiting, for the admin overview and nav. */
export async function openReportCount(): Promise<number> {
  return (await listCandidateReports()).filter((r) => !r.resolved).length;
}
