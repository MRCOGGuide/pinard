// The sign-in page's ?next= may only lead to a page of this site (pre-launch review, 18 November 2026).
// Usage: npx tsx scripts/test-safe-next.mts
const { safeNext } = await import("../src/lib/safeNext");

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

const kept = ["/", "/plan", "/practise?format=sba", "/session?day=2026-11-20&from=today", "/practise/12", "/admin/bank?q=pre-eclampsia%20aspirin"];
for (const path of kept) check(`keeps ${JSON.stringify(path)}`, safeNext(path) === path);

const refused = [
  null,
  undefined,
  "",
  "plan",
  "https://example.com",
  "//example.com",
  "/\\example.com",
  "/\texample.com",
  "/\t/example.com",
  "/\n/example.com",
  "/\r/example.com",
  "/ /example.com",
  "/\u0000/example.com",
  "/x\\..\\..\\example.com",
  "/sign-in",
  "/sign-in?next=/plan",
  "/sign-up",
];
for (const path of refused) check(`refuses ${JSON.stringify(path)}`, safeNext(path) === null);

// What a browser would make of each kept path: still this site.
for (const path of kept) check(`${JSON.stringify(path)} stays on this site`, new URL(path, "https://pinardapp.com").origin === "https://pinardapp.com");

console.log(failed ? `${failed} failed` : "safe next: all passed");
if (failed) process.exit(1);
