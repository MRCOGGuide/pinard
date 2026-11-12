"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Moving between pages, as one continuous thing.
 *
 * A press on a link to another page of the site is handed to the
 * browser's view transition: it takes a picture of the page being left,
 * waits for the next one to be on screen, and moves between the two.
 * The top bar holds still, the title and the dark band behind it glide
 * to their new size and words, and the rest leaves and arrives
 * (the ::view-transition rules in globals.css). Asked for by the owner,
 * 12 November 2026.
 *
 * It changes nothing about where a link goes or how the page is
 * fetched: the navigation is still the router's own push. Everything it
 * does not understand is left exactly as it was:
 *
 * - a browser without view transitions, or a reader who asks for less
 *   motion, gets the plain navigation (and app/template's short fade);
 * - a link held with a modifier, opened in a new tab, to another site,
 *   to a file, to the same page, or to a route that is not a page
 *   (/api, /auth) is not touched;
 * - a link can opt out with data-no-transition.
 *
 * The page being left is frozen while its picture is up, so the wait is
 * kept short two ways. The next page is asked for as the pointer goes
 * down, a tenth of a second or so before the press is finished, so it
 * has a head start. And the wait is capped: if the page has still not
 * arrived the transition is let go and the navigation finishes on its
 * own, with the short fade from app/template.
 */
const WAIT = 700;

type Transition = { finished: Promise<void> };
type Starts = { startViewTransition?: (update: () => Promise<void>) => Transition };

export function PageTransitions() {
  const router = useRouter();
  const pathname = usePathname();
  /** Called when the page being waited for is on screen. */
  const landed = useRef<(() => void) | null>(null);

  useEffect(() => {
    landed.current?.();
    landed.current = null;
  }, [pathname]);

  useEffect(() => {
    const doc = document as Document & Starts;
    if (typeof doc.startViewTransition !== "function") return;
    const less = window.matchMedia("(prefers-reduced-motion: reduce)");

    /** Where a press on this would go, if it is ours to carry. */
    const destination = (e: MouseEvent): URL | null => {
      if (less.matches || e.defaultPrevented || e.button !== 0) return null;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
      const link = (e.target as Element | null)?.closest?.("a");
      if (!link || !link.href || link.hasAttribute("download")) return null;
      if (link.target && link.target !== "_self") return null;
      if (link.dataset.noTransition !== undefined) return null;
      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return null;
      }
      if (url.origin !== window.location.origin) return null;
      if (url.pathname === window.location.pathname) return null;
      if (/^\/(api|auth)\//.test(url.pathname) || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
      return url;
    };

    // The head start: the whole page, not only its outline.
    const onDown = (e: PointerEvent) => {
      const url = destination(e);
      if (url) router.prefetch(url.pathname + url.search, { kind: "full" } as never);
    };

    const onClick = (e: MouseEvent) => {
      const url = destination(e);
      if (!url) return;

      // Ours from here: the link's own handler stands down when it sees
      // the press has been taken.
      e.preventDefault();
      const root = document.documentElement;
      root.dataset.vt = "";
      const transition = doc.startViewTransition!(
        () =>
          new Promise<void>((resolve) => {
            const timer = window.setTimeout(resolve, WAIT);
            landed.current = () => {
              window.clearTimeout(timer);
              resolve();
            };
            router.push(url.pathname + url.search + url.hash);
          })
      );
      transition.finished
        .catch(() => {})
        .finally(() => {
          delete root.dataset.vt;
        });
    };

    // Before the link's own handler, which is how it gets to stand down.
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [router]);

  return null;
}
