import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/NavLink";
import { createClient } from "@/lib/supabase/server";

async function getViewer() {
  try {
    const supabase = createClient();
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
 * Set in the wide frame the landing page uses, so the mark and the
 * links stay exactly where they are as you move from the landing page
 * to any other: the narrower reading column is for content, not for
 * the frame around it. It stays at the top as you scroll, on a
 * translucent paper ground, and the page you are on is a filled pill
 * rather than a word in the same grey as the rest.
 *
 * On a phone the mark and the account sit on the first row and the
 * links take the row beneath, scrolling sideways if they outrun the
 * screen.
 */
export async function SiteHeader() {
  const { user, role, name } = await getViewer();
  const initial = (name?.trim()[0] ?? user?.email?.[0] ?? "?").toUpperCase();

  return (
    <header className="z-40 border-b border-line bg-ground sm:sticky sm:top-0 sm:bg-ground/85 sm:backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-8">
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
          {user ? (
            <>
              <NavLink href="/">Today</NavLink>
              <NavLink href="/practise">Practise</NavLink>
              <NavLink href="/mock">Mock</NavLink>
              <NavLink href="/progress">Progress</NavLink>
              {role === "admin" && <NavLink href="/admin">Admin</NavLink>}
            </>
          ) : (
            <>
              <NavLink href="/sample">Try the questions</NavLink>
              <NavLink href="/about">How it works</NavLink>
              <NavLink href="/pricing">Pricing</NavLink>
            </>
          )}
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
