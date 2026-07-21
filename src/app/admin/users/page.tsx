import { TraceHeader } from "@/components/TraceHeader";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXAM_LABELS, type ExamPart } from "@/lib/types";
import { UserRow } from "./UserRow";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  exam: ExamPart | null;
  joined: string;
  subscription: string;
  isSelf: boolean;
};

export default async function UsersPage() {
  // Who am I (to guard self role changes)?
  const authed = createClient();
  const {
    data: { user: me },
  } = await authed.auth.getUser();

  const admin = createAdminClient();
  const [{ data: authUsers }, { data: profiles }, { data: subs }] =
    await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin
        .from("profiles")
        .select("id, name, role, exam, created_at"),
      admin.from("subscriptions").select("user_id, status, tier"),
    ]);

  const profileById = new Map(
    ((profiles ?? []) as {
      id: string;
      name: string;
      role: string;
      exam: ExamPart | null;
      created_at: string;
    }[]).map((p) => [p.id, p])
  );
  const subById = new Map(
    ((subs ?? []) as { user_id: string; status: string; tier: string }[]).map(
      (s) => [s.user_id, s]
    )
  );

  const users: AdminUser[] = (authUsers?.users ?? []).map((u) => {
    const profile = profileById.get(u.id);
    const sub = subById.get(u.id);
    const subscription =
      profile?.role === "admin"
        ? "admin"
        : sub && ["active", "trialing"].includes(sub.status)
          ? `${sub.tier} (${sub.status})`
          : "free";
    return {
      id: u.id,
      email: u.email ?? "—",
      name: profile?.name ?? "",
      role: profile?.role ?? "user",
      exam: profile?.exam ?? null,
      joined: (profile?.created_at ?? u.created_at) ?? "",
      subscription,
      isSelf: u.id === me?.id,
    };
  });

  const admins = users.filter((u) => u.role === "admin").length;

  return (
    <>
      <TraceHeader
        title="Users"
        eyebrow="Owner area"
        lede={`${users.length} registered · ${admins} admin${admins === 1 ? "" : "s"}`}
      />

      <div className="overflow-x-auto rounded-card border border-hairline bg-porcelain shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-graphite/60">
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Exam</th>
              <th className="p-3 font-medium">Subscription</th>
              <th className="p-3 font-medium">Joined</th>
              <th className="p-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                examLabel={u.exam ? EXAM_LABELS[u.exam] : "—"}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
