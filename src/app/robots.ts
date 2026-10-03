import type { MetadataRoute } from "next";

/**
 * Who may index this, and when.
 *
 * Before launch nothing is indexable: the metadata in layout.tsx
 * already says noindex, and this says the same thing at the door so a
 * crawler does not have to fetch a page to be told. The two agree
 * because they read the same switch — a robots.txt that opened while
 * the pages said noindex would waste everyone's time.
 *
 * The admin area stays out whatever the switch says. It is behind
 * sign-in and would never be indexed anyway; naming it here keeps a
 * crawler from spending its budget finding that out.
 */
const launched = process.env.NEXT_PUBLIC_LAUNCHED === "true";
const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://pinardapp.com";

export default function robots(): MetadataRoute.Robots {
  if (!launched) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api", "/account", "/session", "/mock", "/diagnostic"],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
