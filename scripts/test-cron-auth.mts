/**
 * Does the cron secret survive being pasted into a dashboard?
 *
 *   npx tsx scripts/test-cron-auth.mts
 *
 * This exists because it did not. The comparison was one `===`
 * against `Bearer ${secret}`, so a value that arrived in the hosting
 * dashboard with a trailing newline — which is what pasting into a
 * dashboard field routinely produces — could never match, and nothing
 * visible failed. The scheduled caller simply got 401 every hour and
 * the run it was meant to make never happened.
 *
 * The middleware had already learned this with the site gate and
 * trimmed for it. The cron secret had not.
 */
import { carriesCronSecret } from "../src/lib/cron-auth";

let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`pass  ${name}`);
  else {
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
    failed += 1;
  }
}

const SECRET = "7f3a2c91-4b8e-4d52-9a71-0e6c5d8b2f14";
const req = (authorization?: string) =>
  new Request("https://example.test/api/reminders", {
    headers: authorization === undefined ? {} : { authorization },
  });

process.env.CRON_SECRET = SECRET;

check("the exact header is accepted", carriesCronSecret(req(`Bearer ${SECRET}`)));

/* The ways a pasted value goes wrong, at either end. */
check(
  "a trailing newline on the stored secret still matches",
  (() => {
    process.env.CRON_SECRET = `${SECRET}\n`;
    const ok = carriesCronSecret(req(`Bearer ${SECRET}`));
    process.env.CRON_SECRET = SECRET;
    return ok;
  })()
);
check(
  "a trailing space on the stored secret still matches",
  (() => {
    process.env.CRON_SECRET = `${SECRET} `;
    const ok = carriesCronSecret(req(`Bearer ${SECRET}`));
    process.env.CRON_SECRET = SECRET;
    return ok;
  })()
);
check(
  "a leading space on the stored secret still matches",
  (() => {
    process.env.CRON_SECRET = ` ${SECRET}`;
    const ok = carriesCronSecret(req(`Bearer ${SECRET}`));
    process.env.CRON_SECRET = SECRET;
    return ok;
  })()
);
check(
  "whitespace around the sent header still matches",
  carriesCronSecret(req(`  Bearer ${SECRET}  `))
);
check(
  "more than one space after Bearer still matches",
  carriesCronSecret(req(`Bearer   ${SECRET}`))
);
check("a lowercase scheme still matches", carriesCronSecret(req(`bearer ${SECRET}`)));

/* What must still be refused. Trimming is a tolerance for whitespace,
   not for being wrong. */
check("a different secret is refused", !carriesCronSecret(req("Bearer nope")));
check(
  "a secret that merely starts the same is refused",
  !carriesCronSecret(req(`Bearer ${SECRET.slice(0, 20)}`))
);
check(
  "a secret with an inner character changed is refused",
  !carriesCronSecret(req(`Bearer ${SECRET.replace("4b8e", "4b8f")}`))
);
check("no header at all is refused", !carriesCronSecret(req()));
check("an empty header is refused", !carriesCronSecret(req("")));
check("the scheme alone is refused", !carriesCronSecret(req("Bearer")));
/* The Bearer prefix is optional, which the double negative in an
   earlier version of this line quietly asserted while its name said
   the opposite. Stated properly: a scheduler that sends the token
   with no scheme is still the cron, and tolerating that costs
   nothing, since the token is the whole of the proof either way. */
check(
  "the bare secret with no scheme is also accepted",
  carriesCronSecret(req(SECRET))
);

/* With no secret configured, nothing authenticates this way: the
   endpoint falls back to requiring an admin session. An empty env var
   must never mean "everyone is the cron". */
check(
  "an unset secret accepts nothing",
  (() => {
    delete process.env.CRON_SECRET;
    const a = carriesCronSecret(req("Bearer anything"));
    const b = carriesCronSecret(req("Bearer "));
    process.env.CRON_SECRET = SECRET;
    return !a && !b;
  })()
);
check(
  "a whitespace-only secret accepts nothing",
  (() => {
    process.env.CRON_SECRET = "   ";
    const a = carriesCronSecret(req("Bearer    "));
    const b = carriesCronSecret(req("Bearer"));
    process.env.CRON_SECRET = SECRET;
    return !a && !b;
  })()
);

console.log(`\n${failed === 0 ? "all passed" : failed + " failed"}`);
if (failed) process.exit(1);
