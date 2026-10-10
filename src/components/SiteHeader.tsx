import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MainNav } from "@/components/MainNav";
import { createClient } from "@/lib/supabase/server";

async function getViewer() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, role: null as string | null, name: null as string | null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", user.id)
      .single();

    return { user, role: profile?.role ?? null, name: (profile?.name as string | null) ?? null };
  } catch {
    // Supabase not configured yet — render the signed-out shell.
    return { user: null, role: null as string | null, name: null as string | null };
  }
}

/**
 * The top bar, the same on every page.
 *
 * Signed out it is set in the wide frame the landing, How it works and
 * Pricing use, so the mark and the links stay exactly where they are
 * between them; signed in it lines up with the app's reading column,
 * over the content it heads. It stays at the top as you scroll, on
 * frosted white glass: white so it starts the page's alternation of
 * white and sage bands (the landing's first section is sage), glass so
 * the page shows through softly as it passes beneath. The links slide a
 * pill to the page you are on, like the billing switch on Pricing.
 *
 * On a phone the mark and the account sit on the first row and the
 * links take the row beneath, scrolling sideways if they outrun the
 * screen.
 */
export async function SiteHeader() {
  const { user, role, name } = await getViewer();
  const initial = (name?.trim()[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <header className="z-40 border-b border-line/70 bg-surface shadow-[0_6px_20px_-14px_rgb(0_0_0/0.18)] sm:sticky sm:top-0 sm:bg-surface/70 sm:backdrop-blur-xl sm:backdrop-saturate-150">
      {/* Signed in, the bar lines up with the app's reading column, so the
          mark sits over the content it heads; signed out it keeps the wide
          frame the landing, How it works and Pricing are set in. */}
      <div
        className={`mx-auto flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 ${
          user ? "max-w-question" : "max-w-[1120px] sm:px-8"
        }`}
      >
        {/*
          Nudged up four pixels, an optical correction: the compact
          mark's viewBox carries the listening arcs above the horn, so
          the wordmark inside it sits lower than the box it is in.
          logo-listen quickens the arcs when pointed at.
        */}
        <Link href="/" className="logo-listen order-1 -translate-y-[4px] rounded" aria-label="Pinard home">
          <Logo variant="compact" className="h-9 w-auto" />
        </Link>

        <nav
          className="order-3 -mx-4 flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-3 pb-1 sm:order-2 sm:mx-0 sm:w-auto sm:overflow-x-visible sm:px-0 sm:pb-0"
          aria-label="Main"
        >
          {/*
            Signed out, the app's own routes would be four links to a
            sign-in form, so a visitor gets the pages that are theirs to
            read instead. Pricing is for people deciding; once signed in
            it lives on /account and in the footer.
          */}
          <MainNav
            links={
              user
                ? [
                    { href: "/", label: "Today" },
                    { href: "/practise", label: "Practise" },
                    { href: "/mock", label: "Mock" },
                    { href: "/progress", label: "Progress" },
                    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
                  ]
                : [
                    { href: "/sample", label: "Try the questions" },
                    { href: "/about", label: "How it works" },
                    { href: "/pricing", label: "Pricing" },
                  ]
            }
          />
        </nav>

        <div className="order-2 ml-auto flex items-center gap-1.5 sm:order-3">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                href="/account"
                aria-label="Your account"
                title="Your account"
                className="btn-motion inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand font-display text-[16px] font-semibold text-on-brand"
              >
                {initial}
              </Link>
              <form action="/auth/sign-out" method="post">
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-full px-3 font-ui text-[14px] font-medium text-ink/70 hover:bg-sunk hover:text-ink-strong"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="btn-motion inline-flex h-9 items-center rounded-control bg-brand px-4 font-ui text-[15px] font-semibold text-on-brand hover:bg-good"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
