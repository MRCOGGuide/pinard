import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { MockRunner } from "./MockRunner";
import { getAccess, hasFullAccess } from "@/lib/access";
import { FULL_PAPER } from "@/lib/mock";
import { PASS_THRESHOLD } from "@/lib/performance";
import { buildMockPaper } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mock exam — Pinard" };

/**
 * A mock paper, sat rather than practised.
 *
 * Everything the daily session does to help — marking as you go,
 * explaining each answer before the next — is the opposite of what a
 * mock is for. Here the paper runs to a clock, nothing is marked until
 * it is handed in, and the whole of it is reviewed afterwards.
 */
export default async function MockPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const questions = await buildMockPaper(supabase, profile.exam, FULL_PAPER);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Mock exam" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/80">
            A mock paper needs approved questions across the syllabus, and
            there aren&rsquo;t any yet. Check back once the bank has been
            filled.
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
    <MockRunner
      questions={questions}
      passMark={PASS_THRESHOLD}
      fullPaper={FULL_PAPER}
    />
  );
}
