"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/sections", label: "Sections" },
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/examples", label: "Examples" },
  { href: "/admin/generate", label: "Generate" },
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/review", label: "Review" },
  { href: "/admin/bank", label: "Bank" },
  { href: "/admin/coverage", label: "Coverage" },
  { href: "/admin/similar-values", label: "Similar values" },
  { href: "/admin/superseded", label: "Superseded" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/billing", label: "Billing" },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-hairline"
    >
      {tabs.map(({ href, label }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? "border-greentop text-theatre"
                : "border-transparent text-graphite/60 hover:text-theatre"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
