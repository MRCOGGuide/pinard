import { TopUpConsent } from "@/components/TopUpConsent";
import { buttonClass } from "@/components/ui";
import type { AskAllowance } from "@/lib/askAllowance";

/**
 * How much of Ask Pinard is left, always in view, and what to do when
 * it runs out (pricing Phase 2, section E).
 *
 * The meter reads "7 of 30 used this month" (or "this plan period" on
 * the three-month plan) with the renewal date. Near the end, and at
 * the end, it offers the two top-up packs and, where there is one, the
 * next tier up: a friendly message with the reset date, never a wall.
 */
function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function AskMeter({ allowance, className = "" }: { allowance: AskAllowance; className?: string }) {
  if (allowance.unlimited || allowance.limit <= 0) return null;
  const used = Math.min(allowance.used, allowance.limit);
  const share = Math.round((used / allowance.limit) * 100);
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 font-ui text-[14px] text-ink/70">
        <span>
          <span className="font-semibold tabular-nums text-ink-strong">
            {used} of {allowance.limit}
          </span>{" "}
          used this {allowance.periodLabel}
          {allowance.credits > 0 && <>, plus {allowance.credits} top-up {allowance.credits === 1 ? "question" : "questions"}</>}
        </span>
        <span>Renews {shortDate(allowance.resetsAt)}</span>
      </p>
      <span
        className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sunk"
        role="meter"
        aria-label="Ask Pinard questions used"
        aria-valuemin={0}
        aria-valuemax={allowance.limit}
        aria-valuenow={used}
      >
        <span className="block h-full rounded-full bg-good" style={{ width: `${share}%` }} />
      </span>
    </div>
  );
}

export function AskLimitPanel({ allowance, className = "" }: { allowance: AskAllowance; className?: string }) {
  if (allowance.unlimited || !allowance.offerTopUp) return null;
  const out = allowance.remaining <= 0;
  return (
    <div className={`rounded-control border p-4 ${out ? "border-accent/40 bg-accent/5" : "border-line bg-sunk"} ${className}`.trim()}>
      <p className="font-ui text-[15px] font-semibold text-ink-strong">
        {out
          ? `That's this ${allowance.periodLabel}'s Ask Pinard questions used. They renew on ${shortDate(allowance.resetsAt)}.`
          : `${allowance.remaining} Ask Pinard ${allowance.remaining === 1 ? "question" : "questions"} left this ${allowance.periodLabel}.`}
      </p>
      <p className="mt-1 font-ui text-[14px] leading-relaxed text-ink/70">
        A top-up carries on straight away and lasts as long as your subscription.
        {allowance.upgrade && (
          <> Or move to {allowance.upgrade.name} for {allowance.upgrade.allowance} a {allowance.periodLabel === "month" ? "month" : "plan period"}; you pay only the difference for the time left.</>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {allowance.topUps.map((t) => (
          <form key={t.id} action="/api/stripe/ask-topup" method="post">
            <input type="hidden" name="pack" value={t.id} />
            <TopUpConsent className="mb-2 max-w-[22rem]" />
            <button type="submit" className={buttonClass(out ? "primary" : "secondary", "sm")}>
              Add {t.questions} questions: {t.price}
            </button>
          </form>
        ))}
        {allowance.upgrade && (
          <form action="/api/stripe/upgrade" method="post">
            <input type="hidden" name="tier" value={allowance.upgrade.tier} />
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Upgrade to {allowance.upgrade.name}
            </button>
          </form>
        )}
      </div>
      <p className="mt-2 font-ui text-[13px] text-ink/65">Prices exclude any local tax, which is shown before you pay.</p>
    </div>
  );
}
