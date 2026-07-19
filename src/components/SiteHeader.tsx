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
    "rounded px-1 py-2 text-sm font-medium text-graphite/80 hover:text-theatre";

  return (
    <header className="border-b border-hairline bg-porcelain">
      <div className="mx-auto flex w-full max-w-question flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3">
        <Link href="/" className="rounded" aria-label="Pinard home">
          <Logo variant="compact" className="h-9 w-auto" />
        </Link>

        <nav className="flex items-center gap-4" aria-label="Main">
          <Link href="/" className={navLink}>
            Today
          </Link>
          <Link href="/practise" className={navLink}>
            Practise
          </Link>
          <Link href="/progress" className={navLink}>
            Progress
          </Link>
          {role === "admin" && (
            <Link href="/admin" className={navLink}>
              Admin
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded px-1 py-2 text-sm font-medium text-greentop hover:text-theatre"
              >
                Sign out
              </button>
            </form>
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
