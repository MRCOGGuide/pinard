"use client";

import { useEffect } from "react";
import { TraceHeader } from "@/components/TraceHeader";
import { Button, ButtonLink } from "@/components/ui";

/**
 * When a page fails to render.
 *
 * Says what happened and what to do, and nothing about why: the error's
 * own message can carry a query, a path or a key name, so it is never
 * printed. The digest is a reference Next.js generates for the server
 * log, safe to show, and the one thing worth quoting to support.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The browser console only, for whoever is debugging; never the page.
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <TraceHeader
        title="This page did not load"
        lede="Something went wrong on our side. Your answers and progress are saved as you go, so trying again is safe."
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/" variant="secondary">
          Go to the home page
        </ButtonLink>
      </div>
      {error.digest && (
        <p className="mt-6 font-ui text-[14px] text-ink/65">
          If it keeps happening, quote reference{" "}
          <span className="font-mono">{error.digest}</span> when you get in touch.
        </p>
      )}
    </div>
  );
}
