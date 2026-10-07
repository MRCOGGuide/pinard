import { TraceHeader } from "@/components/TraceHeader";
import { EmptyState } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listCandidateReports } from "@/lib/questionReports";
import { ReportList } from "./ReportList";

/**
 * Every question a candidate has said is wrong, from the "Report a
 * problem" control and from challenges Ask Pinard agreed with. Open ones
 * first; each links to its question in the bank, where it can be edited
 * or rejected.
 */
export default async function ReportsPage() {
  await requireAdmin();
  const reports = await listCandidateReports();
  const open = reports.filter((r) => !r.resolved).length;

  return (
    <>
      <TraceHeader
        title="Reports"
        eyebrow="Owner area"
        lede="Questions candidates have reported as wrong, and challenges Ask Pinard agreed with. Check each against its source, fix or reject it in the bank, then mark the report resolved."
      />
      {reports.length === 0 ? (
        <EmptyState title="No reports">
          When a candidate reports a question, or wins an argument with Ask Pinard about one, it appears here.
        </EmptyState>
      ) : (
        <ReportList reports={reports} open={open} />
      )}
    </>
  );
}
