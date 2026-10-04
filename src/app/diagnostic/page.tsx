import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import {
  diagnosticAvailability,
  DIAGNOSTIC_INTERVAL_DAYS,
} from "@/lib/diagnostic";
import { createClient } from "@/lib/supabase/server";
import { buildDiagnosticSession, buildFreeDiagnostic } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";
import { DiagnosticRunner } from "./DiagnosticRunner";

export default async function DiagnosticPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  /*
    The diagnostic used to be locked on the free tier, which put the
    one thing that can tell a candidate something true and
    uncomfortable about their revision behind the decision it should be
    informing. It is open now, at a length someone will actually sit
    before they have paid for anything: fifteen questions, one in each
    of fifteen sub-topics, against a full diagnostic of five in every
    one of thirty-five.
  */
  const tier = await getAccess(supabase, user.id);
  const full = hasFullAccess(tier);

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, diagnostic_completed_at")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  /*
    Locked between sittings. It used to be open for ever: nothing
    stopped anyone taking it twice in an afternoon, which burns the
    unseen questions the daily plan needs and leaves no two sittings a
    fixed distance apart, so nothing can be compared with anything.
  */
  const availability = diagnosticAvailability(
    profile.diagnostic_completed_at,
    new Date()
  );
  if (availability.status === "waiting") {
    return (
      <>
        <TraceHeader title="Diagnostic" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed text-ink/80">
            You sat the diagnostic on{" "}
            {availability.lastAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            . The next one opens in {availability.daysLeft} day
            {availability.daysLeft === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Every {DIAGNOSTIC_INTERVAL_DAYS} days, so two sittings are far
            enough apart to mean something. Your readiness score keeps moving
            in the meantime, from every question you answer.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Back to today
          </Link>
        </div>
      </>
    );
  }

  const questions = full
    ? await buildDiagnosticSession(supabase, profile.exam)
    : await buildFreeDiagnostic(supabase, profile.exam);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Diagnostic" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm leading-relaxed text-ink/80">
            The diagnostic needs approved questions across the syllabus, and
            there aren&rsquo;t any yet. Check back soon.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-card border border-line bg-surface px-5 py-2.5 text-sm font-medium text-ink/80 hover:text-ink-strong"
          >
            Back to today
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TraceHeader
        title="Diagnostic"
        eyebrow={full ? undefined : "Free"}
        explain={
          full
            ? `${questions.length} questions, one from every topic, with no feedback until the end. It sweeps topics your plan has stopped scheduling, so anything slipping is found rather than assumed. Repeatable every ${DIAGNOSTIC_INTERVAL_DAYS} days.`
            : `${questions.length} questions, each from a different part of the syllabus. About a quarter of an hour, no feedback until the end, and then an honest picture of where you are.`
        }
      />
      <DiagnosticRunner questions={questions} />
    </>
  );
}
