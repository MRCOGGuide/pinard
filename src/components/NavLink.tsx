"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A top-bar link that knows when it is the page you are on: it says so
 * to a screen reader (aria-current) and sits in a filled pill, so the
 * bar doubles as a "you are here".
 *
 * Today is "/", which every path starts with, so it matches exactly;
 * the others match their own section and anything inside it
 * (/practise/12 is still Practise).
 */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname() ?? "";
  const here = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      className={`inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 font-ui text-[15px] font-medium transition-colors duration-fast ${
        here
          ? "bg-surface text-ink-strong shadow-card ring-1 ring-line"
          : "text-ink/70 hover:bg-sunk hover:text-ink-strong"
      }`}
    >
      {children}
    </Link>
  );
}
