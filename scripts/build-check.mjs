/**
 * A production build that cannot break the dev server.
 *
 * `next dev` and `next build` both write `.next`. Building to check
 * that something compiles therefore overwrites what the running dev
 * server is serving, and localhost comes back as unstyled HTML with
 * every chunk 404. That has happened four times in one working day,
 * each time costing a round trip to notice and a `rm -rf .next` to
 * undo, and remembering to stop the server first is a discipline
 * rather than a guarantee.
 *
 * This writes somewhere else instead. Use it for every local build:
 *
 *   npm run build:check
 *
 * `npm run build` still writes `.next` — that is what Vercel runs — but
 * it now refuses to start while a dev server is up. See
 * scripts/guard-dev-server.mjs.
 */
import { spawn } from "node:child_process";

const DIST = ".next-verify";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "build"],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: DIST },
    // npx resolves through the shell on Windows.
    shell: process.platform === "win32",
  }
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`\nBuilt into ${DIST}/ — .next and the dev server untouched.`);
  }
  process.exit(code ?? 1);
});
