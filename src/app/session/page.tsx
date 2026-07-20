import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import { buildDailySession } from "@/lib/session";
import { getAccess, hasFullAccess } from "@/lib/access";

export default async function SessionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const tier = await getAccess(supabase, user.id);
  if (!hasFullAccess(tier)) redirect("/pricing");

  const today = new Date().toISOString().slice(0, 10);
  const session = await buildDailySession(supabase, user.id, today);

  if (session.status === "needs_onboarding") redirect("/onboarding");

  if (session.questions.length === 0) {
    return (
      <>
        <TraceHeader title="Today's session" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/80">
            There are no approved questions for today&rsquo;s topics yet. Once
            questions have been generated and approved, your daily session will
            appear here — weighted toward the topics you most need.
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
        title="Today's session"
        lede={
          session.focus.length
            ? `Weighted toward ${session.focus.map((f) => f.title).slice(0, 3).join(", ")}.`
            : undefined
        }
      />
      <SessionRunner questions={session.questions} title="Daily session" />
    </>
  );
}
