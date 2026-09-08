/**
 * When a question was generated, and when it was approved — for the
 * admin screens only. Candidates never see either.
 *
 * The date on its own was already shown and could not answer the
 * question it was there for. 534 questions were generated on one day
 * and 359 approved on another, so "8 Sep 2026" against a row tells you
 * nothing about which run it came from or which sitting you approved
 * it in. The time is the part that separates them.
 *
 * The timezone is pinned rather than left to the machine. These
 * components render on the server and again in the browser, and a
 * server in UTC formatting 00:30 as "00:30" while the browser makes it
 * "01:30" is a hydration mismatch — invisible until React swaps the
 * text out. Pinned to UK time because that is the clock the exam, the
 * guidance and the owner all keep.
 */
const ZONE = "Europe/London";

const DATE_AND_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ZONE,
});

const TIME_ONLY = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ZONE,
});

/** "8 Sep 2026, 14:32" — or null if there is no timestamp. */
export function formatWhen(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_AND_TIME.format(date);
}

/**
 * The same, with the date dropped when it repeats one already shown:
 * "generated 8 Sep 2026, 09:14 · approved 16:02" reads better than the
 * date twice, and the two are usually the same day.
 */
export function formatWhenAfter(
  value: string | null | undefined,
  earlier: string | null | undefined
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (earlier) {
    const before = new Date(earlier);
    if (
      !Number.isNaN(before.getTime()) &&
      DATE_AND_TIME.format(date).slice(0, 11) ===
        DATE_AND_TIME.format(before).slice(0, 11)
    ) {
      return TIME_ONLY.format(date);
    }
  }
  return DATE_AND_TIME.format(date);
}
