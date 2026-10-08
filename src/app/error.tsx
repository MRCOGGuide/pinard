"use client";

import { useEffect } from "react";
import { Trace } from "@/components/Trace";
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
      <h1 className="font-display text-[32px] font-semibold leading-[1.12] text-ink-strong sm:text-[40px]">
        This page did not load
      </h1>
      <Trace className="mt-3 h-5 w-44" />
      <p className="mt-3 max-w-[38rem] font-ui text-[17px] leading-relaxed text-ink/75">
        Something went wrong on our side. Your answers and progress are saved
        as you go, so trying again is safe.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
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
