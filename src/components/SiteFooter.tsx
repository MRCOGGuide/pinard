import Link from "next/link";
import { FeedbackBox } from "@/components/FeedbackBox";
import { CookieSettingsLink } from "@/components/CookieBanner";

const links = [
  { href: "/about", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/cookies", label: "Cookies" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

export function SiteFooter({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <footer className="border-t border-line bg-ground">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-8">
        <nav
          className="flex flex-wrap justify-center gap-x-4 gap-y-1"
          aria-label="Footer"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-block py-1 font-ui text-[14px] font-medium text-ink/70 transition-colors duration-fast hover:text-ink-strong"
            >
              {l.label}
            </Link>
          ))}
          <CookieSettingsLink className="inline-block py-1 font-ui text-[14px] font-medium text-ink/70 transition-colors duration-fast hover:text-ink-strong" />
        </nav>
        {/* The pilot's whole value is the sentence nobody thought to
            ask about, and nobody leaves a product to send one. */}
        {signedIn && (
          <div className="mt-3 text-center">
            <FeedbackBox />
          </div>
        )}
        <p className="mt-3 text-center font-ui text-[14px] text-ink/65">
          Pinard is a revision aid, not a source of clinical advice.
        </p>
        {/* Said on every page, because the exam's name is on most of
            them (Phase 11, intellectual property). */}
        <p className="mt-1 text-center font-ui text-[13px] text-ink/65">
          Pinard is independent and is not affiliated with or endorsed by
          the Royal College of Obstetricians and Gynaecologists.
        </p>
        <p className="mt-1 text-center font-ui text-[13px] text-ink/65">
          © {new Date().getFullYear()} Pinard. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
