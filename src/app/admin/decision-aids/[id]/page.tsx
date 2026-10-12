import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import { formatReference } from "@/lib/reference";
import { renderAid, type AidContent, type AidFlag, type AidKind, type AidStatus } from "@/lib/decision-aid-shape";
import { AidReview } from "./AidReview";

export const dynamic = "force-dynamic";

const FLAG_SOURCE: Record<AidFlag["source"], string> = {
  wording: "Wording not found on the page",
  image: "The second look at the picture disagrees",
  text: "The guideline's text appears to contradict it",
};

/**
 * One decision aid: the picture of the original beside the transcription,
 * what the checks found, and the owner's verdict.
 */
export default async function DecisionAidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const { data } = await db
    .from("decision_aids")
    .select("*, content_documents(title,source_reference,source_year,file_url)")
    .eq("id", Number(id))
    .maybeSingle();
  if (!data) notFound();

  const doc = data.content_documents as { title: string; source_reference: string | null; source_year: number | null; file_url: string | null } | null;
  const images: string[] = [];
  for (const p of (data.image_paths ?? []) as string[]) {
    const { data: signed } = await db.storage.from("sources").createSignedUrl(p, 3600);
    if (signed?.signedUrl) images.push(signed.signedUrl);
  }
  let pdfUrl: string | null = null;
  if (doc?.file_url) {
    const { data: signed } = await db.storage.from("sources").createSignedUrl(doc.file_url, 3600);
    pdfUrl = signed?.signedUrl ? `${signed.signedUrl}#page=${data.page}` : null;
  }
  const { data: siblings } = await db.from("decision_aids").select("id").order("document_id").order("page").order("position");
  const ids = (siblings ?? []).map((s: { id: number }) => s.id);
  const at = ids.indexOf(Number(id));

  const content = data.content as AidContent;
  const kind = data.kind as AidKind;
  const flags = (data.flags ?? []) as AidFlag[];

  return (
    <>
      <p className="mb-2 flex flex-wrap gap-4 font-ui text-[14px]">
        <Link href="/admin/decision-aids" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">All decision aids</Link>
        {at > 0 && <Link href={`/admin/decision-aids/${ids[at - 1]}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Previous</Link>}
        {at >= 0 && at < ids.length - 1 && <Link href={`/admin/decision-aids/${ids[at + 1]}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Next</Link>}
      </p>
      <TraceHeader
        title={data.title as string}
        lede={`${doc?.title ?? ""}${doc ? `, ${formatReference({ reference: doc.source_reference, year: doc.source_year })}` : ""}, page ${data.page}. ${data.decision ?? ""}`}
      />

      {flags.length > 0 && (
        <section className="mb-6 rounded-card border border-accent/40 bg-surface p-4">
          <h2 className="font-ui text-[16px] font-semibold text-ink-strong">What the checks found</h2>
          <ul className="mt-2 space-y-2 font-ui text-[14px] text-ink/85">
            {flags.map((f, i) => (
              <li key={i}>
                <span className="font-semibold">{FLAG_SOURCE[f.source]}:</span> {f.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">The original</h2>
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`Page ${data.page} of the guideline: ${data.title}`} className="mb-3 w-full rounded-card border border-line bg-white" />
          ))}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="font-ui text-[14px] text-ink/70 underline underline-offset-2 hover:text-ink-strong">
              Open the guideline at page {data.page}
            </a>
          )}
        </section>
        <section>
          <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">As Pinard will follow it</h2>
          {kind === "flowchart" ? (
            <pre className="whitespace-pre-wrap rounded-card border border-line bg-surface p-4 font-ui text-[14px] leading-relaxed text-ink/90">
              {renderAid({ title: "", kind, content }).replace(/^\n/, "")}
            </pre>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-left font-ui text-[14px]">
                {content.columns && content.columns.length > 0 && (
                  <thead className="bg-sunk">
                    <tr>{content.columns.map((c, i) => <th key={i} scope="col" className="px-3 py-2 align-top">{c}</th>)}</tr>
                  </thead>
                )}
                <tbody>
                  {(content.rows ?? []).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      {r.map((c, j) => <td key={j} className="whitespace-pre-line px-3 py-2 align-top">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {content.footnotes && content.footnotes.length > 0 && (
            <ul className="mt-3 space-y-1 font-ui text-[13px] text-ink/65">
              {content.footnotes.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          <AidReview id={Number(id)} status={data.status as AidStatus} note={(data.owner_note as string | null) ?? ""} />
        </section>
      </div>
    </>
  );
}
