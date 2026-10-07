"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Card, Chip, Tabs, Toast } from "@/components/ui";
import type { CandidateReport } from "@/lib/questionReports";
import { reasonLabel } from "@/lib/questionReportReasons";
import { setReportResolved } from "./actions";

export function ReportList({ reports, open }: { reports: CandidateReport[]; open: number }) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = reports.filter((r) => (tab === "open" ? !r.resolved : r.resolved));

  function toggle(ref: string, resolved: boolean) {
    setMsg(null);
    startTransition(async () => {
      const result = await setReportResolved(ref, resolved);
      setMsg(result.error ? { ok: false, text: result.error } : { ok: true, text: resolved ? "Resolved." : "Reopened." });
    });
  }

  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: "open", label: `Open (${open})` },
          { value: "resolved", label: `Resolved (${reports.length - open})` },
        ]}
      />
      {msg && <Toast tone={msg.ok ? "good" : "bad"} className="mt-3">{msg.text}</Toast>}
      <div className="mt-4 space-y-3">
        {shown.length === 0 && <p className="text-sm text-ink/60">Nothing here.</p>}
        {shown.map((r) => (
          <Card key={r.ref}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={r.kind === "challenge" ? "warn" : "accent"}>
                {r.kind === "challenge" ? "Ask Pinard challenge" : reasonLabel(r.reason)}
              </Chip>
              <span className="font-mono text-label text-ink/55">
                Q{r.questionId}
                {r.status ? ` · ${r.status}` : ""} · {new Date(r.createdAt).toLocaleDateString("en-GB")}
                {r.email ? ` · ${r.email}` : ""}
              </span>
            </div>
            {r.stem && <p className="mt-2 line-clamp-3 text-sm text-ink/80">{r.stem}</p>}
            {r.note && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status === "approved" ? (
                <Link href={`/admin/bank?q=${r.questionId}`} className="rounded-card border border-line px-3 py-1.5 text-xs text-ink/80 hover:border-good">
                  Open in bank
                </Link>
              ) : (
                <span className="px-1 py-1.5 text-xs text-ink/55">Not in the approved bank</span>
              )}
              <Button size="sm" variant={r.resolved ? "secondary" : "primary"} disabled={pending} onClick={() => toggle(r.ref, !r.resolved)}>
                {r.resolved ? "Reopen" : "Mark resolved"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
