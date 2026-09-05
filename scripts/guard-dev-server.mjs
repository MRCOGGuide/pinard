/**
 * Refuse to run `next build` while a dev server is serving from .next.
 *
 * Runs as `prebuild`, so it guards the plain `npm run build` — the one
 * that writes `.next` and therefore the one that breaks a running dev
 * server. The separate output directory in build:check makes that
 * impossible; this catches the case where build:check was not the
 * command reached for.
 *
 * Deployment is unaffected: nothing is listening on the dev port in a
 * build container, and CI is let through explicitly in case something
 * ever is.
 */
import net from "node:net";

const PORT = Number(process.env.PORT || 3000);

if (process.env.CI || process.env.VERCEL) {
  process.exit(0);
}

const socket = new net.Socket();
let settled = false;

const done = (listening) => {
  if (settled) return;
  settled = true;
  socket.destroy();
  if (!listening) process.exit(0);

  console.error(
    [
      "",
      `  A dev server is listening on port ${PORT}.`,
      "",
      "  `next build` writes .next, which is where that server is serving",
      "  from — building now would leave localhost returning unstyled HTML",
      "  with every script 404, until .next is deleted and dev restarted.",
      "",
      "  To check that the project compiles, without touching it:",
      "",
      "      npm run build:check",
      "",
      "  To build for real, stop the dev server first.",
      "",
    ].join("\n")
  );
  process.exit(1);
};

socket.setTimeout(500);
socket.once("connect", () => done(true));
socket.once("timeout", () => done(false));
socket.once("error", () => done(false));
socket.connect(PORT, "127.0.0.1");
