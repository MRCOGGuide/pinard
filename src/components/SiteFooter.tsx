import Link from "next/link";

const links = [
  { href: "/about", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-porcelain">
      <div className="mx-auto w-full max-w-question px-4 py-5">
        <nav
          className="flex flex-wrap justify-center gap-x-4 gap-y-1"
          aria-label="Footer"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs font-medium text-graphite/60 hover:text-theatre"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-center text-xs text-graphite/60">
          Pinard is a revision aid, not a source of clinical advice.
        </p>
        <p className="mt-1 text-center text-xs text-graphite/40">
          © {new Date().getFullYear()} Pinard. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
