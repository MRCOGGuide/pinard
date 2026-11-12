"use client";

import { useEffect, useState } from "react";

/**
 * Wraps every page and, unlike the layout, is made afresh on each
 * navigation.
 *
 * Moving between pages is carried by the browser's own view transition
 * where it has one (components/PageTransitions): the old page leaves,
 * the new one arrives, and the title and its band glide between the
 * two. This wrapper is what is left for a browser without that: the
 * short fade and 4px rise the site has always had (.page-enter in
 * globals.css).
 *
 * It never runs on the first page of a visit. That page is drawn by the
 * server and is simply there; fading it in would only hold back the
 * first thing the reader sees.
 */

/** False until the first page of the visit has been put on screen. */
let arrived = false;

export default function Template({ children }: { children: React.ReactNode }) {
  // Decided once, as the page is made: whether a view transition is
  // already carrying this navigation (PageTransitions marks the root).
  const [enter] = useState(
    () => arrived && typeof document !== "undefined" && !("vt" in document.documentElement.dataset)
  );
  useEffect(() => {
    arrived = true;
  }, []);
  return <div className={enter ? "page-enter" : undefined}>{children}</div>;
}
