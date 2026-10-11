import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChunksByIds } from "@/lib/retrieval";
import { formatReference } from "@/lib/reference";
import { TraceHeader } from "@/components/TraceHeader";
import { citedChunks, type PathwayBody, type PathwayConflict, type PathwayStatus } from "@/lib/pathway-shape";
import { PathwayReview, type SourcePassage } from "./PathwayReview";

export const dynamic = "force-dynamic";

/**
 * One pathway, laid out as it will be followed, every line with the
 * passage it came from one click away: the owner reads it against the
 * source, removes what is wrong, chooses between sources that disagree,
 * and approves it or sends it back.
 */
export default async function PathwayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await createAdminClient().from("pathways").select("*").eq("slug", slug).maybeSingle();
  if (!data) notFound();

  const body = data.body as PathwayBody;
  const conflicts = (data.conflicts ?? []) as PathwayConflict[];
  const chunks = await getChunksByIds(citedChunks(body, conflicts));
  const sources: Record<number, SourcePassage> = {};
  for (const c of chunks) {
    sources[c.chunk_id] = {
      title: c.document_title,
      reference: formatReference({ reference: c.source_reference, year: c.source_year, togYear: c.tog_year, togIssue: c.tog_issue }),
      text: c.text,
    };
  }

  return (
    <>
      <p className="mb-2 font-ui text-[14px]">
        <Link href="/admin/pathways" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">
          All pathways
        </Link>
      </p>
      <TraceHeader title={data.name as string} lede="Click a source to read the passage the line came from." />
      <PathwayReview
        slug={slug}
        status={data.status as PathwayStatus}
        body={body}
        gaps={(data.gaps ?? []) as string[]}
        conflicts={conflicts}
        removed={(data.removed ?? []) as string[]}
        note={(data.owner_note as string | null) ?? ""}
        sources={sources}
      />
    </>
  );
}
