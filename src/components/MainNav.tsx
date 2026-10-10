"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The top bar's links, set like the billing switch on the pricing page:
 * a recessed track with one white pill that slides to the page you are
 * on, so moving between pages is seen to move rather than to blink.
 * The page you are on also says so to a screen reader (aria-current).
 *
 * Today is "/", which every path starts with, so it matches exactly;
 * the others match their own section and anything inside it
 * (/practise/12 is still Practise). On a page that is none of them
 * (the landing page, Account) the pill fades out where it was.
 *
 * Until the page is running the pill has not been measured, so the
 * link you are on carries its own white fill for that first moment.
 */
export function MainNav({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname() ?? "";
  const active = links.findIndex(({ href }) =>
    href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`)
  );

  const track = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [pill, setPill] = useState<{ x: number; w: number; shown: boolean } | null>(null);
  // Slides only once it has been placed, never in from the left edge.
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    function place() {
      const el = active >= 0 ? items.current[active] : null;
      setPill((prev) =>
        el ? { x: el.offsetLeft, w: el.offsetWidth, shown: true } : prev ? { ...prev, shown: false } : { x: 0, w: 0, shown: false }
      );
    }
    place();
    // Fonts arriving or the window changing width move the links.
    const watch = new ResizeObserver(place);
    if (track.current) watch.observe(track.current);
    return () => watch.disconnect();
  }, [active, links.length]);

  useEffect(() => {
    if (!pill || moving) return;
    const frame = requestAnimationFrame(() => setMoving(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, moving]);

  return (
    <div ref={track} className="relative inline-flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-sunk/80 p-1">
      {pill && (
        <span
          aria-hidden="true"
          className={`absolute inset-y-1 left-0 rounded-full bg-surface shadow-card ring-1 ring-line/60 motion-reduce:transition-none ${
            moving ? "transition-[transform,width,opacity] duration-[250ms] ease-out" : ""
          }`}
          style={{ transform: `translateX(${pill.x}px)`, width: pill.w, opacity: pill.shown ? 1 : 0 }}
        />
      )}
      {links.map(({ href, label }, i) => (
        <Link
          key={href}
          href={href}
          ref={(el) => {
            items.current[i] = el;
          }}
          aria-current={i === active ? "page" : undefined}
          className={`relative z-10 inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 font-ui text-[15px] font-medium transition-colors duration-[250ms] ${
            i === active ? "text-ink-strong" : "text-ink/70 hover:text-ink-strong"
          } ${i === active && !pill ? "bg-surface shadow-card" : ""}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
