/**
 * Cookie options for every Supabase client: server, middleware and
 * browser. The library's defaults leave out Secure, so on the live site
 * the session cookie could in principle travel over plain HTTP (security
 * audit L7); it is Secure wherever the site is served over HTTPS.
 * Development runs on http://localhost, where a Secure cookie would not
 * be stored at all.
 */
export const SUPABASE_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
