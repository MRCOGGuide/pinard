// A new account is never an admin (owner, 18 November 2026: "make sure just guests once they create
// an account it is not an Admin"). Admins make other admins in Admin > Users, and only there.
// Usage: npx tsx scripts/test-new-accounts-not-admin.mts
import fs from "node:fs";
import path from "node:path";

let failed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
};

const sql = fs
  .readdirSync("supabase")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => fs.readFileSync(path.join("supabase", f), "utf8"))
  .join("\n");

check("profiles.role defaults to 'user'", /role\s+public\.user_role\s+not null\s+default\s+'user'/.test(sql));

// Every definition of the trigger that makes a profile for a new account: none may set a role.
const triggers = [...sql.matchAll(/create or replace function public\.handle_new_user\(\)[\s\S]*?\$\$;/g)].map((m) => m[0]);
check("the new-account trigger exists", triggers.length > 0);
check("the new-account trigger never sets a role", triggers.every((t) => !/\brole\b/.test(t)));
check("no SQL reads a role from the sign-up metadata", !/raw_(user|app)_meta_data\s*->>?\s*'role'/.test(sql));
check("a trigger stops anyone but an admin changing a role", /create trigger protect_role_change/.test(sql));
const grant = sql.match(/grant update \(([^)]*)\)\s+on public\.profiles to authenticated/);
check("signed-in accounts cannot write the role column (phase58)", Boolean(grant) && !/\brole\b/.test(grant![1]));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const code = walk("src").map((f) => [f, fs.readFileSync(f, "utf8")] as const);

const roleWrites = code.filter(([, s]) => /\.(update|upsert|insert)\(\{[^}]*\brole\s*:/.test(s)).map(([f]) => f);
check(
  "the only code that writes a role is Admin > Users",
  roleWrites.length === 1 && roleWrites[0].replace(/\\/g, "/").endsWith("src/app/admin/users/actions.ts")
);
const usersActions = code.find(([f]) => f.replace(/\\/g, "/").endsWith("src/app/admin/users/actions.ts"))?.[1] ?? "";
check("and it checks for an admin first", /await requireAdmin\(\)/.test(usersActions));

const signUps = code.filter(([, s]) => /auth\.(signUp|admin\.createUser)\(/.test(s));
check("accounts are created in the expected places", signUps.length >= 1);
check(
  "no account is created with a role in its metadata",
  signUps.every(([, s]) => !/(user_metadata|app_metadata|data)\s*:\s*\{[^}]*\brole\b/.test(s))
);

console.log(failed ? `${failed} failed` : "new accounts are never admins: all passed");
if (failed) process.exit(1);
