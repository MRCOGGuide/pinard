"use client";

import { useState, useTransition } from "react";
import type { AdminUser } from "./page";
import { setUserRole } from "./actions";
import { NONE } from "@/components/ui";

export function UserRow({
  user,
  examLabel,
}: {
  user: AdminUser;
  examLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user.role === "admin";

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setUserRole(user.id, !isAdmin);
      if (result.error) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className="p-3 font-medium text-ink">{user.name || NONE}</td>
      <td className="p-3 font-mono text-xs text-ink/70">{user.email}</td>
      <td className="p-3 text-ink/70">{examLabel}</td>
      <td className="p-3">
        <span
          className={`font-mono text-xs ${
            user.subscription.includes("active") || user.subscription === "admin"
              ? "text-good"
              : "text-ink/60"
          }`}
        >
          {user.subscription}
        </span>
      </td>
      <td className="p-3 font-mono text-xs text-ink/55">
        {user.joined
          ? new Date(user.joined).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : NONE}
      </td>
      <td className="p-3 text-xs text-ink/70">
        <Activity user={user} />
      </td>
      <td className="p-3">
        <div className="flex flex-col items-start gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-label ${
              isAdmin
                ? "border-good text-good"
                : "border-line text-ink/60"
            }`}
          >
            {user.role}
          </span>
          {!user.isSelf && (
            <button
              type="button"
              disabled={pending}
              onClick={toggle}
              className="text-xs font-medium text-ink/50 hover:text-ink-strong disabled:opacity-40"
            >
              {isAdmin ? "Make user" : "Make admin"}
            </button>
          )}
          {error && <span className="text-label text-accent-ink">{error}</span>}
        </div>
      </td>
    </tr>
  );
}

/** What they have done: enough to tell a tried-everything assessor from
 *  one who signed up and stopped. */
function Activity({ user }: { user: AdminUser }) {
  const a = user.activity;
  if (!a) return <span>{NONE}</span>;
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : NONE;
  return (
    <div className="space-y-0.5">
      <div>Last active {day(a.lastActive)}</div>
      <div className="font-mono text-label text-ink/55">
        {a.answered} answered · diagnostic {a.diagnosticAt ? day(a.diagnosticAt) : "not taken"} · {a.mocks} mock{a.mocks === 1 ? "" : "s"} · {a.asks} asked
      </div>
      {(user.invite || a.reviewed) && (
        <div className="font-mono text-label text-ink/55">
          {user.invite ? `invite ${user.invite}` : ""}
          {user.invite && a.reviewed ? " · " : ""}
          {a.reviewed ? "pilot review sent" : ""}
        </div>
      )}
    </div>
  );
}
