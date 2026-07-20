import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { buildDiagnosticSession } from "@/lib/session";
import { DiagnosticRunner } from "./DiagnosticRunner";

export default async function DiagnosticPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam, diagnostic_completed_at")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const questions = await buildDiagnosticSession(supabase, profile.exam);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Diagnostic" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/80">
            The diagnostic needs approved questions across the syllabus, and
            there aren&rsquo;t any yet. Check back soon.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
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
        lede={`${questions.length} questions across every topic. Answer honestly — no feedback until the end, then your plan targets what it finds.`}
      />
      {profile.diagnostic_completed_at && (
        <p className="mb-4 rounded-card border border-hairline bg-porcelain p-3 text-xs text-graphite/60">
          You&rsquo;ve taken the diagnostic before — retaking it updates your
          topic map with your latest answers.
        </p>
      )}
      <DiagnosticRunner questions={questions} />
    </>
  );
}
