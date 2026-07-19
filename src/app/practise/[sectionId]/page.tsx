import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { SessionRunner } from "@/components/SessionRunner";
import { createClient } from "@/lib/supabase/server";
import { buildRevisionSession } from "@/lib/session";

export default async function RevisionPage({
  params,
}: {
  params: { sectionId: string };
}) {
  const sectionId = Number(params.sectionId);
  if (!sectionId) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: section } = await supabase
    .from("sections")
    .select("id, title")
    .eq("id", sectionId)
    .single();
  if (!section) notFound();

  const questions = await buildRevisionSession(supabase, sectionId, 10);

  if (questions.length === 0) {
    return (
      <>
        <TraceHeader title={section.title} eyebrow="Free revision" />
        <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
          <p className="text-sm text-graphite/80">
            No approved questions in this topic yet.
          </p>
          <Link
            href="/practise"
            className="mt-5 inline-block rounded-card border border-hairline bg-porcelain px-5 py-2.5 text-sm font-medium text-graphite/80 hover:text-theatre"
          >
            Back to topics
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TraceHeader title={section.title} eyebrow="Free revision" />
      <SessionRunner questions={questions} title="Free revision" />
    </>
  );
}
