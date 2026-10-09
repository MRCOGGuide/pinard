/**
 * The box ticked before buying an Ask Pinard top-up: consent to have the
 * questions straight away, and acknowledgement that the right to
 * withdraw ends once one is used (Consumer Rights Act 2022; Phase 11).
 * Required in the form and checked again by /api/stripe/ask-topup.
 */
export function TopUpConsent({ className = "" }: { className?: string }) {
  return (
    <label className={`flex items-start gap-2 font-ui text-[14px] leading-snug text-ink/80 ${className}`.trim()}>
      <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-good" />
      <span>
        I want the extra questions straight away, and I understand that I lose my right to withdraw from this
        purchase once I use one of them.
      </span>
    </label>
  );
}
