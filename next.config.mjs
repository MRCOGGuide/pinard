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
};

export default nextConfig;
