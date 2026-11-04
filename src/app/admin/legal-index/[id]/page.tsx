import Link from "next/link";
import { notFound } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import type { LegalKind, LegalMention } from "@/lib/legal-index";
import { formatReference } from "@/lib/reference";
import { createAdminClient } from "@/lib/supabase/admin";
import { LegalReview, type LegalStatus } from "./LegalReview";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<LegalKind, string> = { law: "Law", case: "Case", guidance: "Professional or regulatory guidance" };

/** One entry of the legal index: what it establishes, and every place the library says so. */
export default async function LegalEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createAdminClient();
  const [{ data }, { data: siblings }] = await Promise.all([
    db.from("legal_index").select("id,name,kind,jurisdiction,establishes,topics,mentions,status,owner_note").eq("id", Number(id)).maybeSingle(),
    db.from("legal_index").select("id,status").order("kind").order("name"),
  ]);
  if (!data) notFound();

  const mentions = (data.mentions ?? []) as LegalMention[];
  const { data: docs } = await db
    .from("content_documents")
    .select("id,title,source_reference,source_year")
    .in("id", [...new Set(mentions.map((m) => m.document_id))]);
  const docById = new Map((docs ?? []).map((d) => [d.id, d]));

  // As for decision aids: Next is the next entry waiting for the owner.
  const order = (siblings ?? []) as { id: number; status: LegalStatus }[];
  const at = order.findIndex((s) => s.id === Number(id));
  const waiting = (s: { id: number; status: LegalStatus }) => s.status === "draft" && s.id !== Number(id);
  const next = order.slice(at + 1).find(waiting) ?? order.slice(0, Math.max(at, 0)).find(waiting);
  const left = order.filter(waiting).length;

  return (
    <>
      <p className="mb-2 flex flex-wrap gap-4 font-ui text-[14px]">
        <Link href="/admin/legal-index" className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">All entries</Link>
        {at > 0 && <Link href={`/admin/legal-index/${order[at - 1].id}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Previous</Link>}
        {next ? (
          <Link href={`/admin/legal-index/${next.id}`} className="text-ink/70 underline underline-offset-2 hover:text-ink-strong">Next to review ({left} waiting)</Link>
        ) : (
          <span className="text-ink/60">No others waiting for review</span>
        )}
      </p>
      <TraceHeader
        title={data.name as string}
        lede={`${KIND_LABEL[data.kind as LegalKind]}${data.jurisdiction ? `, ${data.jurisdiction}` : ""}. Bears on: ${((data.topics ?? []) as string[]).join(", ")}.`}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">Where it appears</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {mentions.map((m) => {
              const d = docById.get(m.document_id);
              return (
                <li key={m.chunk_id} className="px-4 py-3 font-ui text-[14px]">
                  <Link href={`/admin/sources/${m.document_id}`} className="text-good underline underline-offset-2 hover:text-ink-strong">
                    {d?.title ?? `Document ${m.document_id}`}
                  </Link>
                  {d && <span className="text-ink/55">, {formatReference({ reference: d.source_reference, year: d.source_year })}</span>}
                  <p className="mt-1 text-ink/80">{m.statement}</p>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-ui text-[16px] font-semibold text-ink-strong">What it establishes</h2>
          <LegalReview id={Number(id)} status={data.status as LegalStatus} establishes={data.establishes as string} note={(data.owner_note as string | null) ?? ""} />
        </section>
      </div>
    </>
  );
}
