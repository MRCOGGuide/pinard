"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button } from "@/components/ui";
import { setSimilarValuesEnabled } from "./actions";

/**
 * Whether candidates see the Similar Values panel at all.
 *
 * Declining facts group by group is the right tool once the review is
 * under way. Before it starts, every unreviewed figure is already in
 * front of candidates, and this is the only thing that stops that
 * without working through them first.
 */
export function PanelSwitch({
  enabled,
  available,
}: {
  enabled: boolean;
  available: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Nothing to switch until the table exists. Saying so beats a control
  // that looks live and silently does nothing.
  if (!available) {
    return (
      <Banner tone="warn" className="mb-4">
        The panel is <strong>off</strong> for candidates, and stays off until
        this switch has somewhere to record its state. Run{" "}
        <code className="font-mono text-xs">
          supabase/phase30-app-settings.sql
        </code>{" "}
        in the Supabase SQL editor, then reload.
      </Banner>
    );
  }

  async function toggle() {
    setError(null);
    const next = !enabled;
    const result = await setSimilarValuesEnabled(next);
    if (result.error) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink/80">
          Similar values panel is{" "}
          <span className={enabled ? "text-good" : "text-accent"}>
            {enabled ? "on" : "off"}
          </span>{" "}
          for candidates
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink/60">
          {enabled
            ? "Every fact below that you have not declined is being shown under a candidate's answer."
            : "Nothing below is being shown to anyone. Review at your own pace and turn it on when you are ready."}
        </p>
      </div>
      <Button
        variant={enabled ? "secondary" : "primary"}
        size="sm"
        className="ml-auto"
        onClick={toggle}
        disabled={pending}
      >
        {pending ? "Saving…" : enabled ? "Turn off" : "Turn on"}
      </Button>
      {error && <p className="w-full text-xs text-accent">{error}</p>}
    </div>
  );
}
