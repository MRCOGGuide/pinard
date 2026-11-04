import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TraceHeader } from "@/components/TraceHeader";
import { formatReference } from "@/lib/reference";
import { renderAid, webImagePath, type AidContent, type AidKind, type AidStatus } from "@/lib/decision-aid-shape";
import { AidReview } from "./AidReview";

export const dynamic = "force-dynamic";

/**
 * One decision aid: the picture of the original beside the transcription,
 * and the owner's verdict.
 *
 * The automatic checks' findings are no longer shown: the owner found the
 * aids mostly right and the findings unhelpful (2 November 2026). The page
 * was slow: its requests ran one after another and the pictures were sent
 * at full resolution (up to 6 MB). They now run together, and the picture
 * shown is a web-sized copy, with the original a click away.
 */
export default async function DecisionAidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const [{ data }, { data: siblings }] = await Promise.all([
    db
      .from("decision_aids")
      .select("id,page,title,kind,decision,content,status,owner_note,image_paths,content_documents(title,source_reference,source_year,file_url)")
      .eq("id", Number(id))
      .maybeSingle(),
    db.from("decision_aids").select("id,status").order("document_id").order("page").order("position"),
  ]);
  if (!data) notFound();

  const doc = data.content_documents as unknown as { title: string; source_reference: string | null; source_year: number | null; file_url: string | null } | null;
  const originals = (data.image_paths ?? []) as string[];
  const toSign = [...new Set([...originals, ...originals.map(webImagePath), ...(doc?.file_url ? [doc.file_url] : [])])];
  const { data: signed } = toSign.length ? await db.storage.from("sources").createSignedUrls(toSign, 3600) : { data: [] };
  const urlFor = new Map((signed ?? []).filter((s) => s.signedUrl && !s.error).map((s) => [s.path, s.signedUrl]));
  // An aid found from inside the app has the cut-out page as a PDF, not a picture.
  const images = originals.map((p) => ({ pdf: p.endsWith(".pdf"), show: urlFor.get(webImagePath(p)) ?? urlFor.get(p), full: urlFor.get(p) }));
  const pdf = doc?.file_url ? urlFor.get(doc.file_url) : undefined;
  const pdfUrl = pdf ? `${pdf}#page=${data.page}` : null;

  /* Next is the next aid waiting for the owner's review, not the next in
     the list (owner, 4 November 2026: stepping through approved aids
     slowed his review). After the last it goes round to the first. */
  const order = (siblings ?? []) as { id: number; status: AidStatus }[];
  const at = order.findIndex((s) => s.id === Number(id));
  const waiting = (s: { id: number; status: AidStatus }) => s.status === "draft" && s.id !== Number(id);
  const next = order.slice(at + 1).find(waiting) ?? order.slice(0, Math.max(at, 0)).find(waiting);
  const left = order.filter(waiting).length;
  const content = data.content as AidContent;
  const kind = data.kind as AidKind;

  return (
    <>
      <p className="mb-2 flex flex-wrap gap-4 font-ui text-[14px]">
        <Link href="/admin/decision-aids" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">All decision aids</Link>
        {at > 0 && <Link href={`/admin/decision-aids/${order[at - 1].id}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Previous</Link>}
        {next ? (
          <Link href={`/admin/decision-aids/${next.id}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Next to review ({left} waiting)</Link>
        ) : (
          <span className="text-ink/60">No others waiting for review</span>
        )}
      </p>
      <TraceHeader
        title={data.title as string}
        lede={`${doc?.title ?? ""}${doc ? `, ${formatReference({ reference: doc.source_reference, year: doc.source_year })}` : ""}, page ${data.page}. ${data.decision ?? ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">The original</h2>
          {images.map((img, i) =>
            img.show && img.pdf ? (
              <iframe key={i} src={`${img.show}#toolbar=0&navpanes=0&view=FitH`} title={`Page ${data.page} of the guideline: ${data.title}`} className="mb-3 h-[70vh] w-full rounded-card border border-line bg-white" />
            ) : img.show ? (
              <a key={i} href={img.full ?? img.show} target="_blank" rel="noreferrer" title="Open the full-resolution picture">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.show} alt={`Page ${data.page} of the guideline: ${data.title}`} loading="eager" decoding="async" className="mb-3 w-full rounded-card border border-line bg-white" />
              </a>
            ) : null
          )}
          <p className="flex flex-wrap gap-4 font-ui text-[14px]">
            {images[0]?.full && (
              <a href={images[0].full} target="_blank" rel="noreferrer" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">
                {images[0].pdf ? "Open this page on its own" : "Full-resolution picture"}
              </a>
            )}
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">
                Open the guideline at page {data.page}
              </a>
            )}
          </p>
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
