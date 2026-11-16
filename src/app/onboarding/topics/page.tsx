import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { redirectToSignIn } from "@/lib/auth";
import { leafSections } from "@/lib/performance";
import { coveredSectionIds } from "@/lib/plan-service";
import { isConfidence, type Confidence } from "@/lib/confidence";
import type { Section } from "@/lib/types";
import { getAccess, hasFullAccess } from "@/lib/access";
import { TopicsForm, type TopicGroup } from "./TopicsForm";

/**
 * Step two of the first-visit survey (owner, 16 November 2026): how
 * confident the candidate feels in each topic. Also reached from Account
 * and from Today, to rate or change the ratings later.
 */
export default async function TopicsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return redirectToSignIn();

  const [{ data: profile }, access] = await Promise.all([
    supabase.from("profiles").select("exam").eq("id", user.id).single(),
    getAccess(supabase, user.id),
  ]);
  if (!profile?.exam) redirect("/onboarding");
  // The plan is a subscriber's; a free account goes back to Today.
  const full = hasFullAccess(access);

  const [{ data: sections }, covered, { data: ratingRows }] = await Promise.all([
    supabase.from("sections").select("*").eq("exam", profile.exam).order("sort_order"),
    coveredSectionIds(supabase, profile.exam),
    // Absent until phase55 is run, when this errors and reads as no ratings.
    supabase.from("section_confidence").select("section_id, confidence").eq("user_id", user.id),
  ]);

  const all = (sections ?? []) as Section[];
  const titleById = new Map(all.map((s) => [s.id, s.title]));
  // Only topics the bank can serve: a rating on a topic with no questions
  // could never be confirmed or overridden, and the plan leaves it out.
  const topics = leafSections(all).filter((s) => covered.has(s.id));

  // Under the heading each topic sits below, as on Practise.
  const groups: TopicGroup[] = [];
  for (const topic of topics) {
    const heading = (topic.parent_id ? titleById.get(topic.parent_id) : null) ?? topic.title;
    const group = groups.find((g) => g.heading === heading);
    const item = { id: topic.id, title: topic.title };
    if (group) group.topics.push(item);
    else groups.push({ heading, topics: [item] });
  }

  const initial: Record<number, Confidence> = {};
  for (const r of (ratingRows ?? []) as { section_id: number; confidence: unknown }[]) {
    if (isConfidence(r.confidence)) initial[Number(r.section_id)] = r.confidence;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <TraceHeader
        title="How sure do you feel?"
        lede="Rate each topic. Your plan starts with the ones you are least sure of, and asks early questions in the ones you feel confident in, to check. As you answer, your results take over from these ratings."
      />
      <TopicsForm groups={groups} initial={initial} next={full ? "/plan" : "/"} />
    </div>
  );
}
