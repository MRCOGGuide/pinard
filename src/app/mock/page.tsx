import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { MockRunner } from "./MockRunner";
import { listMockAttempts } from "./attempt-actions";
import { getAccess, hasFullAccess } from "@/lib/access";
import { FULL_PAPER } from "@/lib/mock";
import { PASS_THRESHOLD } from "@/lib/performance";
import { buildMockPaper } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { redirectToSignIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mock exam: Pinard" };

/**
 * A mock paper, sat rather than practised.
 *
 * Everything the daily session does to help — marking as you go,
 * explaining each answer before the next — is the opposite of what a
 * mock is for. Here the paper runs to a clock, nothing is marked until
 * it is handed in, and the whole of it is reviewed afterwards.
 */
export default async function MockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const [questions, history, { data: sections }] = await Promise.all([
    buildMockPaper(supabase, profile.exam, FULL_PAPER),
    listMockAttempts(),
    supabase.from("sections").select("id, title, parent_id").eq("exam", profile.exam),
  ]);
  // Each topic's module (its parent's title, or its own at the top), for the scores grouped as on Practise and Progress.
  const titleOf = new Map((sections ?? []).map((s) => [s.id as number, s.title as string]));
  const moduleOf: Record<number, string> = {};
  for (const s of sections ?? []) {
    moduleOf[s.id as number] = (s.parent_id ? titleOf.get(s.parent_id as number) : null) ?? (s.title as string);
  }

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title="Mock exam" />
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-ui text-[16px] leading-relaxed text-ink/80">
            A mock paper needs approved questions across the syllabus, and
            there aren&rsquo;t any yet. Check back once the bank has been
            filled.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block btn-motion inline-flex h-11 items-center justify-center rounded-full border border-line bg-surface px-5 font-ui text-[15px] font-semibold text-ink-strong hover:border-good/70"
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
      history={history}
      moduleOf={moduleOf}
    />
  );
}
