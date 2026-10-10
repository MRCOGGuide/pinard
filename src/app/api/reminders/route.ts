import { NextResponse } from "next/server";
import { carriesCronSecret } from "@/lib/cron-auth";
import { emailIsConfigured, reminderEmailHtml, sendEmail } from "@/lib/email";
import { unsubscribeApiUrl, unsubscribeUrl } from "@/lib/unsubscribe";
import { currentStreak, readiness } from "@/lib/performance";
import { getStudyPlan } from "@/lib/plan-service";
import { getAccess, hasFullAccess } from "@/lib/access";
import { generateReminderCopy } from "@/lib/reminder-copy";
import {
  detectMilestone,
  isDue,
  localDate,
  localHour,
  minutesFor,
  TIMEZONE,
  type Milestone,
} from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * The daily reminder run (PROJECT.md items 9 and 10).
 *
 * Called by the Vercel cron, and by an admin who wants to see it work.
 * Sends each candidate whose chosen hour has passed one email built
 * from their own plan, and logs it so nobody is emailed twice however
 * often this runs.
 */

const REMINDER_TYPE = "daily-reminder";

async function authorise(request: Request): Promise<boolean> {
  if (carriesCronSecret(request)) return true;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return profile?.role === "admin";
}

type Outcome = {
  user_id: string;
  status: "sent" | "skipped" | "failed";
  reason?: string;
  milestone?: string;
  ai?: boolean;
};

async function run(dryRun: boolean) {
  const supabase = createAdminClient();
  const now = new Date();
  const today = localDate(now);
  const hour = localHour(now);
  const outcomes: Outcome[] = [];

  const { data: profiles, error } = await supabase
    .from("profiles")
    // "*" rather than a column list: timezone arrives with
    // phase33-profile-timezone.sql, and naming a column that does not
    // exist yet fails the whole read and sends nobody anything.
    .select("*")
    .eq("reminders_enabled", true)
    .not("exam_date", "is", null);

  if (error) {
    return {
      ok: false as const,
      error: `could not read profiles: ${error.message}`,
      hour,
      today,
    };
  }

  // Sent already today, and every milestone ever celebrated — both read
  // once rather than per candidate.
  const ids = (profiles ?? []).map((p) => p.id as string);
  const { data: logRows } = ids.length
    ? await supabase
        .from("notifications_log")
        .select("user_id, type, sent_on")
        .in("user_id", ids)
    : { data: [] };

  // Keyed by candidate AND the day in their own zone, since two
  // candidates asking "have I been sent today?" can mean two days.
  const reminderDays = new Map<string, Set<string>>();
  for (const r of logRows ?? []) {
    if (r.type !== REMINDER_TYPE) continue;
    const set = reminderDays.get(r.user_id as string) ?? new Set<string>();
    set.add(r.sent_on as string);
    reminderDays.set(r.user_id as string, set);
  }
  const sentTodayFor = (userId: string, day: string) =>
    reminderDays.get(userId)?.has(day) ?? false;
  const milestonesSent = new Map<string, Set<string>>();
  for (const row of logRows ?? []) {
    const type = row.type as string;
    if (!type.startsWith("milestone:")) continue;
    const set = milestonesSent.get(row.user_id as string) ?? new Set<string>();
    set.add(type);
    milestonesSent.set(row.user_id as string, set);
  }

  /*
    Each candidate's own clock.

    "07:00" used to mean 07:00 in London for everyone, which is 11:00 in
    Karachi and 02:00 in Lagos — and more people sit this exam outside
    the UK than in it. The hour and the calendar day are now both read
    in the candidate's zone, so the once-a-day rule turns over on their
    midnight rather than London's.

    A profile with no zone yet keeps Europe/London, which is exactly
    what it has today.
  */
  const zoneOf = (p: { timezone?: string | null }) =>
    typeof p.timezone === "string" && p.timezone ? p.timezone : TIMEZONE;

  /*
    Their date travels with them to the send, because that is the date
    the log has to record.

    The guard asks "has anything gone out on THEIR day?" and the log
    used to answer with London's: for anyone whose local date differs
    from London's at their own 7am — most of Asia and the Pacific in one
    direction, the Americas in the other — the row written never matched
    the row looked for. While the sender ran once a day that was
    invisible. Run hourly, inside a three-hour window, it would have
    sent the same candidate four reminders in a morning.
  */
  const due = (profiles ?? [])
    .map((p) => {
      const zone = zoneOf(p as { timezone?: string | null });
      try {
        return { p, theirHour: localHour(now, zone), theirToday: localDate(now, zone) };
      } catch {
        // A zone name the runtime does not know: fall back rather than
        // drop the candidate out of the run entirely.
        return { p, theirHour: hour, theirToday: today };
      }
    })
    .filter(({ p, theirHour, theirToday }) =>
      isDue({
        reminderHour: Number(p.reminder_hour ?? 7),
        currentHour: theirHour,
        sentToday: sentTodayFor(p.id as string, theirToday),
        enabled: p.reminders_enabled !== false,
      })
    );

  if (due.length === 0) {
    return { ok: true as const, hour, today, considered: (profiles ?? []).length, sent: 0, outcomes };
  }

  // Email addresses live in auth, not in profiles.
  const { data: authUsers } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authUsers?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  const url = siteUrl();

  for (const { p: profile, theirToday } of due) {
    const userId = profile.id as string;
    const email = emailById.get(userId);
    if (!email) {
      outcomes.push({ user_id: userId, status: "skipped", reason: "no email" });
      continue;
    }

    /*
      Reminder emails are part of a subscription (the plan cards say
      so), and each one is worded by AI, which a free account must not
      cost. A free account was being sent one every day.
    */
    if (!hasFullAccess(await getAccess(supabase, userId))) {
      outcomes.push({ user_id: userId, status: "skipped", reason: "free account" });
      continue;
    }

    const plan = await getStudyPlan(supabase, userId, today);
    if (plan.status !== "ok") {
      outcomes.push({
        user_id: userId,
        status: "skipped",
        reason: "no plan yet",
      });
      continue;
    }

    const day = plan.plan.weeks
      .flatMap((w) => w.days)
      .find((d) => d.date === today);
    const topics = day?.items.map((i) => i.title) ?? [];
    const questionTarget =
      day?.items.reduce((sum, i) => sum + i.question_target, 0) ?? 0;

    const [{ data: answers }, { data: diag }] = await Promise.all([
      supabase
        .from("user_answers")
        .select("answered_at")
        .eq("user_id", userId)
        .order("answered_at", { ascending: false })
        .limit(400),
      supabase
        .from("profiles")
        .select("diagnostic_completed_at")
        .eq("id", userId)
        .single(),
    ]);

    const streak = currentStreak(
      (answers ?? []).map((a) => a.answered_at as string),
      today
    );
    const { secured, total } = readiness(plan.units);

    const milestone: Milestone | null = detectMilestone({
      diagnosticDone: Boolean(diag?.diagnostic_completed_at),
      securedCount: secured,
      totalSections: total,
      streak,
      alreadySent: milestonesSent.get(userId) ?? new Set<string>(),
    });

    const copy = await generateReminderCopy({
      name: (profile.name as string) ?? "",
      examLabel: plan.examLabel,
      daysRemaining: plan.plan.meta.days_remaining,
      topics,
      questionTarget,
      streak,
      milestone,
    });

    const heading = topics.length
      ? `Today: ${topics.slice(0, 2).join(", ")}`
      : "Today's session";
    const subject = `${plan.plan.meta.days_remaining} days to ${plan.examLabel}${
      questionTarget
        ? `, ${questionTarget} questions, about ${minutesFor(questionTarget)} minutes`
        : ""
    }`;

    if (dryRun) {
      outcomes.push({
        user_id: userId,
        status: "skipped",
        reason: `dry run: would send: ${copy.email}`,
        milestone: milestone?.type,
        ai: copy.fromAI,
      });
      continue;
    }

    // One-click unsubscribe, in the email and in the headers mail apps
    // read for their own Unsubscribe button (Phase 11, RFC 8058).
    const unsubscribe = await unsubscribeUrl(url, userId);
    const sent = await sendEmail({
      to: email,
      subject,
      text: `${copy.email}\n\nStart today's session: ${url}/session\n\nPinard is a revision aid, not a source of clinical advice.\nChange when you get these: ${url}/account\nUnsubscribe: ${unsubscribe}`,
      html: reminderEmailHtml({
        heading,
        body: copy.email,
        ctaLabel: "Start today's session",
        ctaUrl: `${url}/session`,
        accountUrl: `${url}/account`,
        unsubscribeUrl: unsubscribe,
      }),
      headers: {
        "List-Unsubscribe": `<${await unsubscribeApiUrl(url, userId)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (!sent.ok) {
      outcomes.push({ user_id: userId, status: "failed", reason: sent.error });
      continue;
    }

    // Logged only after a successful send, so a failure is retried on
    // the next run rather than being recorded as delivered.
    const rows: { user_id: string; type: string; sent_on: string }[] = [
      { user_id: userId, type: REMINDER_TYPE, sent_on: theirToday },
    ];
    if (milestone) {
      rows.push({ user_id: userId, type: milestone.type, sent_on: theirToday });
    }
    await supabase.from("notifications_log").insert(rows);

    outcomes.push({
      user_id: userId,
      status: "sent",
      milestone: milestone?.type,
      ai: copy.fromAI,
    });
  }

  return {
    ok: true as const,
    hour,
    today,
    considered: (profiles ?? []).length,
    sent: outcomes.filter((o) => o.status === "sent").length,
    outcomes,
  };
}

async function handle(request: Request) {
  if (!(await authorise(request))) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }
  // ?dry=1 assembles every reminder and sends none, so the copy can be
  // read before anybody's inbox is involved — and before Resend is even
  // set up, which is the point at which you most want to read it.
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  /*
    The retention limits in the privacy policy, enforced hourly on the
    back of this job (supabase/phase44-retention.sql). Until the owner
    runs that file the function does not exist, the call fails, and
    nothing is deleted: running it is the approval.
  */
  if (!dryRun && carriesCronSecret(request)) {
    const { data, error } = await createAdminClient().rpc("purge_expired_data");
    if (!error && data) console.log("Retention purge:", JSON.stringify(data));
  }

  /*
    Not configured yet is not the same as broken, and the scheduled
    caller has to be able to tell them apart.

    This answered 500, which is what an hourly job reads as "the server
    fell over" — so the workflow went red every hour while the only
    thing wrong was a key nobody had created yet. Hourly red for a
    known, chosen, temporary state teaches whoever watches it to stop
    watching, and the first real failure then goes unread.

    503 with a machine-readable reason instead: still not 2xx, because
    nothing was sent and nothing should claim it was, but nameable by
    the caller so it can wait quietly and shout about anything else.
  */
  if (!dryRun && !emailIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured: set RESEND_API_KEY and RESEND_FROM before reminders can be sent",
        reason: "email_not_configured",
      },
      { status: 503 }
    );
  }

  const result = await run(dryRun);

  /*
    The scheduled caller gets totals only. It is a GitHub Action on a
    public repository and prints what it receives, so per-candidate
    outcomes there were public: account ids, and failure reasons that
    can quote an email address (Phase 11). An admin calling from the
    browser still sees every outcome.
  */
  if (carriesCronSecret(request) && result.ok) {
    const count = (status: Outcome["status"]) =>
      result.outcomes.filter((o) => o.status === status).length;
    for (const o of result.outcomes) {
      if (o.status === "failed") console.error("Reminder failed:", o.user_id, o.reason);
    }
    return NextResponse.json({
      ok: true,
      hour: result.hour,
      today: result.today,
      considered: result.considered,
      sent: count("sent"),
      skipped: count("skipped"),
      failed: count("failed"),
    });
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
