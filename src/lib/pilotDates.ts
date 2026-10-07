import { readSettings } from "@/lib/settings";

/**
 * When the pilot runs. Both dates are set, changed and cleared by the
 * owner on the pilot page; an invited candidate has the full product
 * from the start of the first day to the end of the last.
 *
 * Dates are compared as UK calendar days: the pilot is run from the UK
 * and "ends on the 30th" should mean the 30th as the owner reads it,
 * not the 30th in UTC, which is an hour short of it all summer.
 */

export const PILOT_ACCESS_FROM = "pilot_access_from";
export const PILOT_ACCESS_UNTIL = "pilot_access_until";

export type PilotWindow = { from: string | null; until: string | null };
export type PilotPhase = "before" | "running" | "after";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the UK, as YYYY-MM-DD. */
export function ukToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export async function getPilotWindow(): Promise<PilotWindow> {
  const s = await readSettings([PILOT_ACCESS_FROM, PILOT_ACCESS_UNTIL]);
  const clean = (v: string | undefined) => (v && DAY.test(v.trim()) ? v.trim() : null);
  return { from: clean(s[PILOT_ACCESS_FROM]), until: clean(s[PILOT_ACCESS_UNTIL]) };
}

export function pilotPhase(window: PilotWindow, today = ukToday()): PilotPhase {
  if (window.from && today < window.from) return "before";
  if (window.until && today > window.until) return "after";
  return "running";
}

/** "12 October 2026", for the notices and the admin status line. */
export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Check a pair of dates from the form: each a date or empty, and in order. */
export function validateWindow(from: string, until: string): { window?: PilotWindow; error?: string } {
  const f = from.trim();
  const u = until.trim();
  if (f && !DAY.test(f)) return { error: "Choose a start date." };
  if (u && !DAY.test(u)) return { error: "Choose an end date." };
  if (f && u && u < f) return { error: "The end date is before the start date." };
  return { window: { from: f || null, until: u || null } };
}
