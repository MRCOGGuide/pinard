/**
 * Where the candidate is, as the browser reports it.
 *
 * Reminders are sent on each candidate's own clock, so every screen
 * that writes to their profile takes the chance to record the zone.
 * It is asked of the browser rather than of the candidate: nobody
 * should have to find "Asia/Karachi" in a list to be emailed at seven.
 *
 * Pure and client-safe — the server has no browser to ask.
 */

/** "Europe/London", "Asia/Karachi", or undefined if the browser will not say. */
export function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * An IANA name and nothing else — "Europe/London",
 * "America/Argentina/Buenos_Aires", or a bare "UTC", which some
 * browsers report. Checked before the value reaches a query.
 */
export function isIanaZone(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/.test(value)
  );
}

/**
 * How the zone is written on screen: the city, and the offset a
 * candidate would actually check against. "Asia/Karachi" becomes
 * "Karachi · GMT+5".
 */
export function zoneLabel(zone: string | undefined): string {
  if (!zone) return "your local time";
  const city = zone.split("/").pop()?.replace(/_/g, " ") ?? zone;
  try {
    const offset = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value;
    return offset ? `${city} · ${offset}` : city;
  } catch {
    return city;
  }
}
