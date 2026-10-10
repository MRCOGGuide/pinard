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
import { redirectToSignIn } from "@/lib/auth";

export default async function DiagnosticPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  /*
    Free accounts sit the sample diagnostic: fixed questions, one item
    from every section, the same for everyone (lib/diagnostic). The full
    one, for subscribers, asks two SBAs and an EMQ set from every
    section.
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
          <p className="font-ui text-[16px] leading-relaxed text-ink/80">
            You sat the diagnostic on{" "}
            {availability.lastAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            . The next one opens in {availability.daysLeft} day
            {availability.daysLeft === 1 ? "" : "s"}.
          </p>
          <p className="mt-2 font-ui text-[16px] leading-relaxed text-ink/65">
            Every {DIAGNOSTIC_INTERVAL_DAYS} days, so two sittings are far
            enough apart to mean something. Your readiness score keeps moving
            in the meantime, from every question you answer.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
          >
            Back to today
          </Link>
        </div>
      </>
    );
  }

  const questions = full
    ? await buildDiagnosticSession(supabase, profile.exam, user.id)
    : await buildFreeDiagnostic(supabase);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Diagnostic" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[16px] leading-relaxed text-ink/80">
            The diagnostic needs approved questions across the syllabus, and
            there aren&rsquo;t any yet. Check back soon.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block btn-motion inline-flex h-11 items-center justify-center rounded-control border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
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
        eyebrow={full ? undefined : "Free sample"}
        explain={
          full
            ? `Two single best answers and an EMQ set from every section, at mixed difficulty, with no feedback until the end. It sweeps topics your plan has stopped scheduling, so anything slipping is found rather than assumed. Repeatable every ${DIAGNOSTIC_INTERVAL_DAYS} days.`
            : `${questions.length} questions, no more than one from any section, the same sample for every free account, with no feedback until the end. Then your score, where the marks went, and a preview of the plan it points to; you can see your results so far once you have answered 20.`
        }
      />
      <DiagnosticRunner questions={questions} mode={full ? "full" : "free"} userId={user.id} />
    </>
  );
}
