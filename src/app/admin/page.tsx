import Link from "next/link";
import { TraceHeader } from "@/components/TraceHeader";

const live = [
  {
    href: "/admin/sections",
    title: "Sections manager",
    note: "Exams, sections and sub-topics — create, reorder, toggle active.",
  },
  {
    href: "/admin/sources",
    title: "Source library",
    note: "Upload guidance PDFs or paste text, with reference and year.",
  },
  {
    href: "/admin/examples",
    title: "Example questions",
    note: "SBA and EMQ style exemplars per section. Never shown to users.",
  },
  {
    href: "/admin/generate",
    title: "Generation console",
    note: "Generate SBA/EMQ questions from ingested sources, verified and grounded.",
  },
  {
    href: "/admin/review",
    title: "Review queue",
    note: "Approve, edit or reject generated questions. Keyboard A/E/R.",
  },
  {
    href: "/admin/bank",
    title: "Question bank",
    note: "Every approved question by section and source guideline — edit in place, or clear out a superseded guideline.",
  },
  {
    href: "/admin/users",
    title: "Users",
    note: "View everyone registered, their plan, and grant or remove admin.",
  },
  {
    href: "/admin/billing",
    title: "Billing",
    note: "Change prices and create discount codes and vouchers.",
  },
] as const;

const comingSoon: [string, string][] = [];

export default function AdminPage() {
  return (
    <>
      <TraceHeader
        title="Admin"
        eyebrow="Owner area"
        lede="Manage the syllabus, source material and question exemplars."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {live.map(({ href, title, note }) => (
          <Link
            key={href}
            href={href}
            className="rounded-card border border-hairline bg-porcelain p-4 shadow-card hover:border-greentop"
          >
            <h2 className="font-display text-lg font-semibold text-theatre">
              {title}
            </h2>
            <p className="mt-1 text-xs text-graphite/60">{note}</p>
          </Link>
        ))}
        {comingSoon.map(([title, note]) => (
          <div
            key={title}
            className="rounded-card border border-dashed border-hairline p-4 opacity-70"
          >
            <h2 className="font-display text-lg font-semibold text-theatre/60">
              {title}
            </h2>
            <p className="mt-1 text-xs text-graphite/50">{note}</p>
          </div>
        ))}
      </div>
    </>
  );
}
