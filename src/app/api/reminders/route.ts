import { NextResponse } from "next/server";
import { emailIsConfigured, reminderEmailHtml, sendEmail } from "@/lib/email";
import { currentStreak, readiness } from "@/lib/performance";
import { getStudyPlan } from "@/lib/plan-service";
import { generateReminderCopy } from "@/lib/reminder-copy";
import {
  detectMilestone,
  isDue,
  localDate,
  localHour,
  minutesFor,
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
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }
  const supabase = createClient();
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
    .select("id, name, exam, exam_date, reminder_hour, reminders_enabled")
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

  const sentToday = new Set(
    (logRows ?? [])
      .filter((r) => r.type === REMINDER_TYPE && r.sent_on === today)
      .map((r) => r.user_id as string)
  );
  const milestonesSent = new Map<string, Set<string>>();
  for (const row of logRows ?? []) {
    const type = row.type as string;
    if (!type.startsWith("milestone:")) continue;
    const set = milestonesSent.get(row.user_id as string) ?? new Set<string>();
    set.add(type);
    milestonesSent.set(row.user_id as string, set);
  }

  const due = (profiles ?? []).filter((p) =>
    isDue({
      reminderHour: Number(p.reminder_hour ?? 7),
      currentHour: hour,
      sentToday: sentToday.has(p.id as string),
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

  for (const profile of due) {
    const userId = profile.id as string;
    const email = emailById.get(userId);
    if (!email) {
      outcomes.push({ user_id: userId, status: "skipped", reason: "no email" });
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
        ? ` — ${questionTarget} questions, about ${minutesFor(questionTarget)} minutes`
        : ""
    }`;

    if (dryRun) {
      outcomes.push({
        user_id: userId,
        status: "skipped",
        reason: `dry run — would send: ${copy.email}`,
        milestone: milestone?.type,
        ai: copy.fromAI,
      });
      continue;
    }

    const sent = await sendEmail({
      to: email,
      subject,
      text: `${copy.email}\n\nStart today's session: ${url}/session\n\nPinard is a revision aid, not a source of clinical advice.\nChange when you get these, or turn them off: ${url}/account`,
      html: reminderEmailHtml({
        heading,
        body: copy.email,
        ctaLabel: "Start today's session",
        ctaUrl: `${url}/session`,
        accountUrl: `${url}/account`,
      }),
    });

    if (!sent.ok) {
      outcomes.push({ user_id: userId, status: "failed", reason: sent.error });
      continue;
    }

    // Logged only after a successful send, so a failure is retried on
    // the next run rather than being recorded as delivered.
    const rows: { user_id: string; type: string; sent_on: string }[] = [
      { user_id: userId, type: REMINDER_TYPE, sent_on: today },
    ];
    if (milestone) {
      rows.push({ user_id: userId, type: milestone.type, sent_on: today });
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

  if (!dryRun && !emailIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured — set RESEND_API_KEY and RESEND_FROM before reminders can be sent",
      },
      { status: 500 }
    );
  }

  const result = await run(dryRun);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
