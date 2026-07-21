"use client";

import { useState, useTransition } from "react";
import type { AdminUser } from "./page";
import { setUserRole } from "./actions";

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
    <tr className="border-b border-hairline last:border-0 align-top">
      <td className="p-3 font-medium text-graphite">{user.name || "—"}</td>
      <td className="p-3 font-mono text-xs text-graphite/70">{user.email}</td>
      <td className="p-3 text-graphite/70">{examLabel}</td>
      <td className="p-3">
        <span
          className={`font-mono text-xs ${
            user.subscription.includes("active") || user.subscription === "admin"
              ? "text-greentop"
              : "text-graphite/60"
          }`}
        >
          {user.subscription}
        </span>
      </td>
      <td className="p-3 font-mono text-xs text-graphite/55">
        {user.joined
          ? new Date(user.joined).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—"}
      </td>
      <td className="p-3">
        <div className="flex flex-col items-start gap-1">
          <span
            className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${
              isAdmin
                ? "border-greentop text-greentop"
                : "border-hairline text-graphite/60"
            }`}
          >
            {user.role}
          </span>
          {!user.isSelf && (
            <button
              type="button"
              disabled={pending}
              onClick={toggle}
              className="text-xs font-medium text-graphite/50 hover:text-theatre disabled:opacity-40"
            >
              {isAdmin ? "Make user" : "Make admin"}
            </button>
          )}
          {error && <span className="text-[11px] text-heartbeat">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
