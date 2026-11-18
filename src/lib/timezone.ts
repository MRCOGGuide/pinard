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

/** Where a candidate with no recorded zone is taken to be (as reminders assume). */
export const DEFAULT_ZONE = "Europe/London";

/**
 * The calendar day, YYYY-MM-DD, in the candidate's own zone: of now, or
 * of a moment given as a Date or an ISO timestamp (pre-launch review, 18
 * November 2026: "today" was the UTC date, so a candidate in India saw
 * yesterday's plan until 05:30 and an answer at 02:00 counted for the day
 * before). An unknown or missing zone falls back to London.
 */
export function localDay(zone?: string | null, at: Date | string = new Date()): string {
  const when = typeof at === "string" ? new Date(at) : at;
  const tz = isIanaZone(zone) ? zone : DEFAULT_ZONE;
  try {
    // en-CA writes dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(when);
  }
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
