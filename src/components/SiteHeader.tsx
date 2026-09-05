import Link from "next/link";
import { Logo } from "@/components/Logo";
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
    "shrink-0 whitespace-nowrap rounded px-1 py-2 text-sm font-medium text-graphite/80 hover:text-theatre";

  return (
    <header className="border-b border-hairline bg-porcelain">
      {/* On a phone the mark and the sign-in share the top row — mark
          left, button hard right — and the nav takes the row beneath,
          scrolling sideways if the links outrun the screen. The four
          links alone span 282px of a 343px row, so the button cannot
          sit beside them; ordering it onto the mark's row is what stops
          it stranding on a line of its own. From sm up it is one row. */}
      <div className="mx-auto flex w-full max-w-question flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="order-1 rounded" aria-label="Pinard home">
          <Logo variant="compact" className="h-9 w-auto" />
        </Link>

        <nav
          className="order-3 -mx-4 flex w-[calc(100%+2rem)] items-center justify-between gap-4 overflow-x-auto px-3 sm:order-2 sm:mx-0 sm:w-auto sm:justify-start sm:overflow-x-visible sm:px-0"
          aria-label="Main"
        >
          <Link href="/" className={navLink}>
            Today
          </Link>
          <Link href="/practise" className={navLink}>
            Practise
          </Link>
          <Link href="/mock" className={navLink}>
            Mock
          </Link>
          <Link href="/progress" className={navLink}>
            Progress
          </Link>
          <Link href="/pricing" className={navLink}>
            Pricing
          </Link>
          {role === "admin" && (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          )}
        </nav>

        <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
          {user ? (
            <>
              <Link href="/account" className={navLink}>
                Account
              </Link>
              <form action="/auth/sign-out" method="post">
                <button
                  type="submit"
                  className="rounded px-1 py-2 text-sm font-medium text-greentop hover:text-theatre"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="rounded-card bg-theatre px-4 py-2 text-sm font-medium text-porcelain hover:bg-greentop"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
