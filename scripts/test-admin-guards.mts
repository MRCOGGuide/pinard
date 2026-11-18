// Every admin page and every admin server action checks for an admin itself (pre-launch review,
// 18 November 2026). A layout's check is not re-run on a client navigation, and many admin pages
// read with the service role, so a page or action without its own check is open to any signed-in user.
// Usage: npx tsx scripts/test-admin-guards.mts
import fs from "node:fs";
import path from "node:path";

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  if (!ok) console.log(`FAIL  ${name}`);
};

function walk(dir: string, name: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, name));
    else if (e.name === name) out.push(p);
  }
  return out;
}

const pages = walk("src/app/admin", "page.tsx");
for (const file of pages) {
  const src = fs.readFileSync(file, "utf8");
  check(`${file} calls requireAdmin()`, /await requireAdmin\(\)/.test(src));
}

const actionFiles = walk("src/app/admin", "actions.ts");
let actions = 0;
for (const file of actionFiles) {
  const src = fs.readFileSync(file, "utf8");
  // Helpers in the same file that check for themselves (setStatus in review, say).
  const guardedHelpers = [...src.matchAll(/^(?:async )?function (\w+)\(/gm)]
    .map((m) => m[1])
    .filter((helper) => {
      const at = src.indexOf(`function ${helper}(`);
      const body = src.slice(at).split(/^(?:export )?(?:async )?function /m)[1] ?? "";
      return /requireAdmin\(\)/.test(src.slice(at, at + `function ${helper}(`.length + body.length));
    });
  // Each exported async function's body, up to the next top-level function.
  const parts = src.split(/^export async function /m).slice(1);
  for (const part of parts) {
    actions++;
    const name = part.slice(0, part.indexOf("("));
    const body = part.split(/^(?:export )?(?:async )?function /m)[0];
    const delegates = guardedHelpers.some((helper) => body.includes(`${helper}(`));
    check(`${file} ${name}() calls requireAdmin()`, /requireAdmin\(\)/.test(body) || delegates);
  }
}

const layout = fs.readFileSync("src/app/admin/layout.tsx", "utf8");
check("the admin layout calls requireAdmin()", /await requireAdmin\(\)/.test(layout));

console.log(
  failed
    ? `${failed} failed`
    : `admin guards: all passed (${pages.length} pages, ${actions} actions in ${actionFiles.length} files, and the layout)`
);
if (failed) process.exit(1);
