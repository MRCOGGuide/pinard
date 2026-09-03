/**
 * Where Pinard lives, for links that leave the app: Stripe's return
 * URLs, the reminder email's buttons.
 *
 * One variable, `NEXT_PUBLIC_SITE_URL`. Checkout and the billing portal
 * previously read `NEXT_PUBLIC_APP_URL` while the reminder emails read
 * `NEXT_PUBLIC_SITE_URL`, so setting either one fixed half the links and
 * left the other half pointing somewhere else — the older name is still
 * honoured so that nobody's existing setting silently stops working.
 *
 * Falling back: a request knows its own origin, which is right in every
 * environment. A cron has no request, so it uses the deployment URL —
 * which is a vercel.app address, not the custom domain, and is why the
 * variable is worth setting in production.
 */
export function siteUrl(request?: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      // Fall through to the deployment URL.
    }
  }

  const vercel = process.env.VERCEL_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}
