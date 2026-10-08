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
    if (!user) return { user: null, role: null as string | null };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, name")
      .eq("id", user.id)
      .single();

    return { user, role: profile?.role ?? null };
  } catch {
    // Supabase not configured yet — render the signed-out shell.
    return { user: null, role: null as string | null };
  }
}

export async function SiteHeader() {
  const { user, role } = await getViewer();

  const navLink =
    "shrink-0 whitespace-nowrap rounded px-1 py-2 font-ui text-[15px] font-medium text-ink/75 transition-colors duration-fast hover:text-ink-strong";

  return (
    <header className="border-b border-line bg-ground">
      {/* On a phone the mark and the sign-in share the top row, mark
          left, button hard right: and the nav takes the row beneath,
          scrolling sideways if the links outrun the screen. The four
          links alone span 282px of a 343px row, so the button cannot
          sit beside them; ordering it onto the mark's row is what stops
          it stranding on a line of its own. From sm up it is one row. */}
      <div className="mx-auto flex w-full max-w-question flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {/* logo-listen: the mark listens harder when pointed at, the arcs
            quicken and it lifts a little. The same response the Ask Pinard
            section already uses, rather than a second one invented for the
            header. Hover-capable pointers only, and still at rest under
            prefers-reduced-motion. */}
        {/*
          Nudged up four pixels, which is an optical correction rather
          than a layout one.

          Every box on this row already aligns: the logo link, the nav
          and the links all sit at the same top and the same centre.
          What does not align is the ink. The compact mark's viewBox
          carries the listening arcs above the horn, so the WORDMARK
          inside it centres at 34.3px while the nav text centres at
          30.0px, and the eye reads the word rather than the box. The
          four pixels close that; the horn simply rises a little
          further above the line, which is what a mark beside a row of
          links should do.
        */}
        <Link
          href="/"
          className="logo-listen order-1 -translate-y-[4px] rounded"
          aria-label="Pinard home"
        >
          <Logo variant="compact" className="h-9 w-auto" />
        </Link>

        <nav
          className="order-3 -mx-4 flex w-[calc(100%+2rem)] items-center justify-between gap-3 overflow-x-auto px-3 sm:order-2 sm:mx-0 sm:w-auto sm:justify-start sm:overflow-x-visible sm:px-0"
          aria-label="Main"
        >
          {/*
            Signed out, the app's own routes are four links to a sign-in
            form: Today, Practise, Mock and Progress all redirect, so a
            stranger's first click lands on a wall rather than on
            anything that would persuade them. They get the two pages
            that are theirs to read instead.
          */}
          {user ? (
            <>
              <NavLink href="/">Today</NavLink>
              <NavLink href="/practise">Practise</NavLink>
              <NavLink href="/mock">Mock</NavLink>
              <NavLink href="/progress">Progress</NavLink>
            </>
          ) : (
            <>
              <NavLink href="/sample">Try the questions</NavLink>
              <NavLink href="/about">How it works</NavLink>
            </>
          )}
          {/* Pricing is for people deciding. Once someone is signed in it
              is a link out of the product, and on an admin's header it
              was the item that pushed the row past the content measure
              and wrapped it. It stays in the footer and on /account. */}
          {!user && (
            <NavLink href="/pricing">Pricing</NavLink>
          )}
          {role === "admin" && <NavLink href="/admin">Admin</NavLink>}
        </nav>

        <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
          <ThemeToggle className="-mr-1" />
          {user ? (
            <>
              <NavLink href="/account">Account</NavLink>
              <form action="/auth/sign-out" method="post">
                <button
                  type="submit"
                  className={`${navLink} !text-good hover:!text-ink-strong`}
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="inline-flex h-10 items-center rounded-control bg-brand px-4 font-ui text-[15px] font-semibold text-on-brand transition-[transform,background-color] duration-fast active:scale-[0.98] hover:bg-good motion-reduce:transition-none"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
