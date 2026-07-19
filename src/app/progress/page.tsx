import { TraceHeader } from "@/components/TraceHeader";

export default function ProgressPage() {
  return (
    <>
      <TraceHeader
        title="Progress"
        lede="Your per-topic trace against the 70% pass threshold will appear here."
      />

      <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
        <p className="text-sm text-graphite/70">
          Nothing to trace yet. Answer your first questions and your progress
          chart will begin here.
        </p>
      </div>
    </>
  );
}
