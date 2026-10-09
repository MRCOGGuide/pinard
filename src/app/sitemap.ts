import type { MetadataRoute } from "next";

/**
 * The pages worth finding, which are the ones that argue for the
 * product rather than the ones that are it.
 *
 * Everything behind sign-in is left out: a crawler following /session
 * reaches a redirect, and a sitemap full of redirects is a sitemap a
 * crawler learns to distrust. Empty before launch, in step with
 * robots.ts and the noindex in the layout, all three reading the same
 * switch.
 */
const launched = process.env.NEXT_PUBLIC_LAUNCHED === "true";
const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://pinardapp.com";

const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/sample", priority: 0.9 },
  { path: "/pricing", priority: 0.8 },
  { path: "/about", priority: 0.7 },
  { path: "/faq", priority: 0.6 },
  { path: "/terms", priority: 0.2 },
  { path: "/privacy", priority: 0.2 },
  { path: "/refunds", priority: 0.2 },
  { path: "/cookies", priority: 0.1 },
  { path: "/accessibility", priority: 0.1 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  if (!launched) return [];
  const lastModified = new Date();
  return PUBLIC_PAGES.map((p) => ({
    url: `${site}${p.path}`,
    lastModified,
    changeFrequency: p.path === "/" ? "weekly" : "monthly",
    priority: p.priority,
  }));
}
