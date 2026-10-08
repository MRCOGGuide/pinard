"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A header link that knows when it is the page you are on: it says so
 * to a screen reader (aria-current) and draws a rule under itself, so
 * the header doubles as a "you are here".
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
      className={`relative shrink-0 whitespace-nowrap rounded px-1 py-2 font-ui text-[15px] font-medium transition-colors duration-fast after:absolute after:inset-x-1 after:bottom-0 sm:after:-bottom-[13px] after:h-[2px] after:origin-left after:rounded-full after:bg-good after:transition-transform after:duration-slow after:ease-standard motion-reduce:after:transition-none ${
        here ? "text-ink-strong after:scale-x-100" : "text-ink/75 after:scale-x-0 hover:text-ink-strong"
      }`}
    >
      {children}
    </Link>
  );
}
