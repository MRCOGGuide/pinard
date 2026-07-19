import { redirect } from "next/navigation";
import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";

/**
 * Owner-facing admin area. Strictly separated from the user app:
 * anyone without the admin role is redirected away.
 */
export default async function AdminPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") redirect("/");

  const areas = [
    ["Sections manager", "Exams, sections and sub-topics — coming in Phase 2."],
    ["Source library", "Upload and manage source documents — coming in Phase 2."],
    ["Example questions", "SBA and EMQ style exemplars — coming in Phase 2."],
    ["Generation console", "Queue question generation — coming in Phase 4."],
    ["Review queue", "Approve, edit or reject questions — coming in Phase 4."],
    ["Dashboard", "Users, subscriptions and flags — coming in Phase 4."],
  ] as const;

  return (
    <>
      <TraceHeader
        title="Admin"
        eyebrow="Owner area"
        lede="You are signed in as an admin. These areas arrive in the next build phases."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {areas.map(([title, note]) => (
          <li
            key={title}
            className="rounded-card border border-hairline bg-porcelain p-4 shadow-card"
          >
            <h2 className="font-display text-lg font-semibold text-theatre">
              {title}
            </h2>
            <p className="mt-1 text-xs text-graphite/60">{note}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
