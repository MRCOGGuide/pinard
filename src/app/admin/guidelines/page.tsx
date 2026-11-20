import { TraceHeader } from "@/components/TraceHeader";
import { requireAdmin } from "@/lib/auth";
import { CHECK_EVERY_DAYS, dueAt, isDue } from "@/lib/guidelineCheck";
import { listGuidelineDocs, readGuidelineState } from "@/lib/guidelineCurrency";
import { officialUrl } from "@/lib/officialLink";
import { readReplaced } from "@/lib/replacedDocuments";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/all";
import { GuidelinesBoard, type GuidelineRow } from "./GuidelinesBoard";

// Reading every RCOG and NICE page takes a minute or so.
export const maxDuration = 300;

export default async function GuidelinesPage() {
  // Every admin page checks for itself: a layout's check can be skipped
  // on a client navigation, and these pages read with full rights.
  await requireAdmin();

  const [docs, state, replaced, questions] = await Promise.all([
    listGuidelineDocs(),
    readGuidelineState(),
    readReplaced(true),
    fetchAll((from, to) =>
      createAdminClient().from("generated_questions").select("source_document_ids").eq("status", "approved").range(from, to)
    ) as unknown as Promise<{ source_document_ids: number[] | null }[]>,
  ]);

  const approvedByDoc = new Map<number, number>();
  for (const q of questions) for (const d of q.source_document_ids ?? []) approvedByDoc.set(d, (approvedByDoc.get(d) ?? 0) + 1);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const now = new Date();
  const stale = (iso: string | undefined) => !iso || isDue(iso, now);

  const rows: GuidelineRow[] = docs.map((d) => {
    const rep = replaced[String(d.id)];
    const result = state.results[String(d.id)];
    const manual = state.manual[String(d.id)];
    // A later copy of the same RCOG or NICE guidance already in the library.
    const newer = d.number
      ? docs.find((o) => o.id !== d.id && o.kind === d.kind && o.number === d.number && (o.source_year ?? 0) > (d.source_year ?? 0) && !replaced[String(o.id)])
      : undefined;
    let status: GuidelineRow["status"];
    let detail = "";
    let checkedAt: string | null = null;
    if (rep) {
      status = "replaced";
      const by = rep.by ? byId.get(rep.by) : undefined;
      detail = by ? `Replaced by ${by.source_reference ?? ""}${by.source_year ? ` (${by.source_year})` : ""}, library #${by.id}.` : "Replaced; the newer edition is not in the library.";
      checkedAt = rep.at;
    } else if (d.kind === "other") {
      status = manual && !stale(manual.checkedAt) ? "checked" : "manual";
      detail = manual?.note ?? (manual ? "Checked by an admin." : "No automatic check: look at the publisher's page and mark it checked.");
      checkedAt = manual?.checkedAt ?? null;
    } else if (result) {
      status = result.status;
      detail = result.detail;
      checkedAt = result.checkedAt;
      if (manual && manual.checkedAt > result.checkedAt && status !== "current") {
        status = "checked";
        detail = `${manual.note ?? "Looked at by an admin and found current."} (The automatic check said: ${result.detail})`;
        checkedAt = manual.checkedAt;
      }
    } else {
      status = "unchecked";
      detail = "Not checked yet: run the check.";
    }
    if (newer && !rep) detail = `${detail} A later copy is in the library: #${newer.id} (${newer.source_year}).`.trim();
    return {
      id: d.id,
      title: d.title ?? "",
      reference: d.source_reference ?? "",
      year: d.source_year,
      section: d.section,
      kind: d.kind,
      url: officialUrl({ official_url: d.official_url, source_reference: d.source_reference, title: d.title }) ?? result?.url ?? null,
      status,
      detail,
      checkedAt,
      approved: approvedByDoc.get(d.id) ?? 0,
      suggestion: newer ? { id: newer.id, reference: newer.source_reference ?? "", year: newer.source_year } : null,
    };
  });

  const due = dueAt(state.ranAt);
  return (
    <>
      <TraceHeader
        title="Guidelines"
        lede={`Whether each guideline in the library (RCOG, NICE and the others, not TOG articles) is still the current edition. The RCOG's and NICE's own pages are read every ${CHECK_EVERY_DAYS} days by the scheduled worker, which emails you what has changed; the rest you check by hand here. When a new edition arrives, upload it in Sources, mark the old one replaced here, and take its questions out in the Bank. Nothing is deleted from the library before launch.`}
      />
      <GuidelinesBoard
        rows={rows}
        ranAt={state.ranAt}
        dueAt={due ? due.toISOString() : null}
        due={isDue(state.ranAt, now)}
        running={Boolean(state.runningSince && now.getTime() - new Date(state.runningSince).getTime() < 20 * 60_000)}
      />
    </>
  );
}
