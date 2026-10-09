const isDev = process.env.NODE_ENV !== "production";

/**
 * Security headers on every response (security audit H3,
 * docs/security/REPORT.md). There were none.
 *
 * The content security policy names everything the browser is allowed
 * to load or talk to, which here is very little: the site itself, and
 * Supabase (sign-in and the few reads made from the browser). Forms may
 * post only to the site, and the site's own checkout and portal routes
 * then send the browser on to Stripe, so Stripe's checkout and billing
 * pages are allowed as form destinations. No analytics, no embedded
 * frames, no third-party scripts.
 *
 * 'unsafe-inline' for scripts and styles because Next.js 14 inlines its
 * bootstrap and the theme script in layout.tsx, and per-request nonces
 * would make every page dynamic. 'unsafe-eval' and the websocket are
 * for the development server's hot reload only, never production.
 *
 * frame-ancestors 'none' (with X-Frame-Options for older browsers) stops
 * the site being shown inside another page, which is what would let a
 * candidate be tricked into clicking Delete account or Clear my mock
 * scores on a page they cannot see.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Two years, subdomains included. Browsers ignore it over plain HTTP,
  // so it does nothing on localhost. Not "preload": submitting the
  // domain to the browsers' built-in list is a separate, slow-to-undo
  // decision for the owner.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Where the build output goes.
   *
   * `next dev` and `next build` both write `.next` by default, so a
   * production build run to check that something compiles overwrites
   * the output the running dev server is serving from. The HTML still
   * arrives and every script and stylesheet 404s, which looks like the
   * site is broken rather than like a build happened.
   *
   * So a verification build sets NEXT_DIST_DIR and writes somewhere
   * else — see `npm run build:check`. Nothing sets it in deployment, so
   * Vercel builds `.next` exactly as before.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Not announced: the header tells an attacker which advisories to try.
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
