import Link from "next/link";
import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { TopicTrace } from "@/components/TopicTrace";
import { createClient } from "@/lib/supabase/server";
import {
  buildPlanUnits,
  PASS_THRESHOLD,
  type PerfRow,
} from "@/lib/performance";
import { coveredSectionIds } from "@/lib/plan-service";
import type { Section } from "@/lib/types";

export default async function DiagnosticResultsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("exam")
    .eq("id", user.id)
    .single();
  if (!profile?.exam) redirect("/onboarding");

  const [{ data: sections }, { data: perf }, covered] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam),
    supabase
      .from("user_topic_performance")
      .select("section_id, rolling_accuracy, attempts, mastery, last_practised_at")
      .eq("user_id", user.id),
    coveredSectionIds(supabase, profile.exam),
  ]);

  const units = buildPlanUnits(
    (sections ?? []) as Section[],
    (perf ?? []) as PerfRow[],
    covered
  );
  const attempted = units.filter((u) =>
    ((perf ?? []) as PerfRow[]).some((p) => p.section_id === u.section_id)
  );
  const weakest = [...attempted]
    .filter((u) => u.accuracy < PASS_THRESHOLD)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <>
      <TraceHeader
        title="Your topic map"
        lede="Every topic against the 70% pass threshold. Your plan now front-loads the weakest."
      />

      {weakest.length > 0 ? (
        <div className="mb-6 rounded-card border border-hairline bg-porcelain p-5 shadow-card">
          <p className="text-sm leading-relaxed text-graphite/85">
            Your plan will focus first on{" "}
            <em className="font-display not-italic text-theatre">
              {weakest.map((u) => u.title).join(", ")}
            </em>
            {" "}— the topics with the most ground to gain. Stronger topics
            return for spaced review so they stay secure.
          </p>
        </div>
      ) : attempted.length > 0 ? (
        <div className="mb-6 rounded-card border border-hairline bg-porcelain p-5 shadow-card">
          <p className="text-sm text-graphite/85">
            A strong start — every attempted topic is at or above the pass
            threshold. Your plan keeps them in rotation so they stay there.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {units.map((u) => (
          <TopicTrace
            key={u.section_id}
            title={u.title}
            series={[]}
            accuracy={u.accuracy}
            attempts={
              ((perf ?? []) as PerfRow[]).find(
                (p) => p.section_id === u.section_id
              )?.attempts ?? 0
            }
            covered={u.covered !== false}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/plan"
          className="rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          See my plan
        </Link>
        <Link
          href="/session"
          className="rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
        >
          Start today&rsquo;s session
        </Link>
      </div>
    </>
  );
}
