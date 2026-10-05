/**
 * Does this request carry the cron secret?
 *
 * Both sides are trimmed before comparing, and that is the whole
 * point of this function existing rather than one `===`.
 *
 * A secret is typed into a hosting dashboard by a person, and a value
 * pasted into a dashboard field routinely arrives with a trailing
 * newline or space. The middleware already learned this the hard way
 * with the site gate, where an untrimmed compare meant the code the
 * owner set could never match the code the owner typed. The same trap
 * sat here, and it is worse here, because nothing visible fails: the
 * scheduled caller simply gets 401 for ever and the run it was meant
 * to make never happens, silently, every hour.
 *
 * No secret is leaked by trimming. Whitespace at either end of a
 * random token carries no entropy, and an attacker who can guess the
 * token does not need the space.
 */
export function carriesCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (!header) return false;
  return header.replace(/^Bearer\s+/i, "").trim() === secret;
}
