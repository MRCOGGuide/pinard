import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";

export default function TodayPage() {
  return (
    <>
      <TraceHeader title="Today" />

      <div className="rounded-card border border-hairline bg-porcelain p-6 shadow-card">
        <p className="text-sm leading-relaxed">
          No sessions yet today. Your plan suggests{" "}
          <em className="font-display">Maternal medicine</em> — 12 questions,
          about 15 minutes.
        </p>
        <Link
          href="/practise"
          className="mt-5 inline-block rounded-card bg-theatre px-5 py-2.5 text-sm font-medium text-porcelain hover:bg-greentop"
        >
          Start today&rsquo;s session
        </Link>
      </div>
    </>
  );
}
