import { TraceHeader } from "@/components/TraceHeader";

export default function PractisePage() {
  return (
    <>
      <TraceHeader
        title="Practise"
        lede="Browse any section and practise off-plan. Everything you answer still feeds your progress."
      />

      <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
        <p className="text-sm text-graphite/70">
          No sections yet. They will appear here once the syllabus is set up.
        </p>
      </div>
    </>
  );
}
